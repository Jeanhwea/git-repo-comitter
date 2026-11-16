/**
 * 提交流程的阶段函数与计时工具。
 *
 * 从入口拆出，让 executeCommit 只保留编排；每个阶段都是「输入 → 结果/抛错」，
 * 便于单测与阅读。共享同一个 commit 日志器。
 */
import { generateCommitMessageBatched } from "@/domain/commit-message/batch";
import { validateCommitMessage } from "@/domain/commit-message/checker";
import { generateFallbackMessage } from "@/domain/commit-message/fallback";
import { reviewNewFiles } from "@/domain/file-review/reviewer";
import {
  getStagedChangeSet,
  hasStagedChanges,
  hasUnstagedChanges,
  readNewFileContents,
} from "@/infra/git/changes";
import { gitAddAll, gitCommit } from "@/infra/git/repo";
import { GrcError } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { emitProgress } from "@/shared/progress";
import { formatElapsed } from "@/shared/time";

import type { CommitRequest } from "./types";

export const log = createLogger("commit");

/**
 * 按步骤记录耗时：统一「开始 / 完成」日志，避免每步重复取样。
 * @param label - 步骤名，用于「开始 / 完成」两条日志。
 * @param run - 被计时的步骤本体，同步或异步均可。
 */
export async function measure<T>(
  label: string,
  run: () => Promise<T> | T,
): Promise<T> {
  log.debug(`步骤开始：${label}`);
  const t0 = performance.now();
  try {
    return await run();
  } finally {
    log.debug(
      `步骤完成：${label}（耗时 ${formatElapsed(performance.now() - t0)}）`,
    );
  }
}

/**
 * 提交前把待提交内容放进暂存区：stagedOnly 时沿用已暂存内容，否则 git add 未暂存变更。
 * @param stagedOnly - true 时沿用已暂存内容，false 时执行 git add。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
export function stageChanges(stagedOnly: boolean, cwd?: string): void {
  if (stagedOnly) {
    if (!hasStagedChanges(cwd)) {
      throw new GrcError(
        "没有已暂存的变更，请先使用 git add 暂存文件。",
        "NO_STAGED_CHANGES",
      );
    }
    emitProgress("仅提交暂存变更...");
    return;
  }
  if (hasUnstagedChanges(cwd)) {
    emitProgress("暂存所有变更...");
    gitAddAll(cwd);
  }
}

/**
 * 审查门禁：仅在调用方提供 onReview 时启用。
 * 库场景下「是否继续」必须由调用方决定，本模块不做任何终端提问。
 * @param request - 提交请求，本门禁只消费其中的 config 与 onReview。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
export async function runReviewGate(
  request: CommitRequest,
  cwd?: string,
): Promise<void> {
  const { config, onReview } = request;
  if (request.review !== true || !onReview) {
    log.debug("未显式启用审查门禁，跳过");
    return;
  }

  const newFiles = readNewFileContents(!!request.stagedOnly, cwd);
  if (newFiles.length === 0) {
    log.debug("未检测到新增文件，跳过审查门禁");
    return;
  }
  log.debug(`检测到 ${newFiles.length} 个新增文件，进入审查门禁`);

  const result = await reviewNewFiles(newFiles, config);
  if (result.shouldCommit) {
    log.debug("审查通过，允许提交");
    return;
  }

  const approved = await onReview(result);
  if (!approved) {
    throw new GrcError("审查未通过，已取消提交。", "USER_CANCELLED");
  }
  emitProgress("继续提交...");
}

/**
 * 生成兜底提交消息。P1（无 API Key）与 P2（LLM 失败）共用。
 * @param repoPath - 目标仓库路径。
 * @returns 兜底生成的提交消息（已由 generateFallbackMessage 保证合规）。
 */
export function tryFallback(repoPath?: string): string {
  const changeSet = getStagedChangeSet(repoPath);
  return generateFallbackMessage(changeSet);
}

/**
 * 写入 git 前的统一硬门禁：所有路径（正常生成、分批合并、P1 规则化、
 * P2 降级）共用，任何不合规的消息都必须在这里止步。
 * @param message - 待写入的提交消息。
 * @param repoPath - 目标仓库路径。
 * @param noVerify - 是否跳过 git hook。
 */
export function commitChecked(
  message: string,
  repoPath: string | undefined,
  noVerify: boolean | undefined,
): void {
  const validation = validateCommitMessage(message);
  if (!validation.valid) {
    throw new GrcError(
      `提交消息未通过校验，已中止提交（未写入 git）。\n${validation.reason ?? "未知失败"}`,
      "VALIDATION_FAILED",
    );
  }
  log.debug("提交前校验通过，执行 git commit");
  gitCommit(message, repoPath, noVerify);
}

/**
 * LLM 生成成功后的批处理结果。
 * 由 executeCommit 消费，用于分支展示与 batchCount 汇总。
 */
export interface GeneratedMessage {
  message: string;
  batchCount: number;
}

/**
 * 走 LLM 生成提交消息，失败时按错误码决定是否降级兜底。
 * @param diff - 已提取的暂存 diff。
 * @param config - 应用配置。
 * @param repoPath - 目标仓库路径，供兜底采集变更集。
 * @returns 消息、批次数与是否走了兜底。
 */
export async function generateWithFallback(
  diff: string,
  config: CommitRequest["config"],
  repoPath: string | undefined,
): Promise<GeneratedMessage & { isFallback: boolean }> {
  try {
    const result = await measure("生成提交信息", () =>
      generateCommitMessageBatched(diff, config),
    );
    return {
      message: result.message,
      batchCount: result.batchCount,
      isFallback: false,
    };
  } catch (err) {
    // P2：LLM 调用失败后走兜底——捕获 VALIDATION_FAILED / LLM_FAILED
    if (
      err instanceof GrcError &&
      (err.code === "VALIDATION_FAILED" || err.code === "LLM_FAILED")
    ) {
      emitProgress("LLM 生成失败，降级为规则化模式...\n");
      emitProgress("  (已降级：提交消息由规则生成，不含 AI 语义分析)\n");
      return {
        message: await measure("生成提交信息（降级兜底）", () =>
          tryFallback(repoPath),
        ),
        batchCount: 1,
        isFallback: true,
      };
    }
    throw err;
  }
}
