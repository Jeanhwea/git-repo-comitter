/**
 * 领域层 —— 提交流程编排（库与 CLI 共用）。
 *
 * F05：原先这套编排写在 app/commands/commit.ts 里，边跑流程边 console.log，
 * 被其他代码调用时无法关闭输出、也无法拿到结构化结果。
 * 本模块把编排抽成「输入 → 结果」的纯异步函数：
 * - 不打印（进度走 shared/progress 的输出槽，未装配即静默）；
 * - 不退出进程（失败抛 GrcError，退出码翻译交给 CLI 适配层）；
 * - 不读全局配置（config 由调用方显式传入）。
 *
 * CLI 与本模块的关系是「参考消费者」：app/commands/commit 负责渲染与退出码。
 */
import type { AppConfig } from "@/config/types";
import { generateCommitMessageBatched } from "@/domain/commit-message/batch";
import {
  type ReviewResult,
  reviewNewFiles,
} from "@/domain/file-review/reviewer";
import {
  hasStagedChanges,
  hasUnstagedChanges,
  readNewFileContents,
} from "@/infra/git/changes";
import { getStagedDiff } from "@/infra/git/diff";
import { gitAddAll, gitCommit, isGitRepo } from "@/infra/git/repo";
import { GrcError, type GrcErrorCode } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import {
  type ProgressSink,
  emitProgress,
  setProgressSink,
} from "@/shared/progress";
import { formatElapsed } from "@/shared/time";

const log = createLogger("commit");

/**
 * 按步骤记录耗时：统一「开始 / 完成」日志，避免每步重复取样。
 * @param label - 步骤名，用于「开始 / 完成」两条日志。
 * @param run - 被计时的步骤本体，同步或异步均可。
 */
async function measure<T>(
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

/** 提交成功的结果。 */
export interface CommitSuccess {
  committed: true;
  /** 写入 git 的提交信息。 */
  message: string;
  /** diff 被拆分处理的批次数（1 表示未分批）。 */
  batchCount: number;
  elapsedMs: number;
}

/** 未发生提交的结果（例如没有任何可提交的变更）。 */
export interface CommitSkipped {
  committed: false;
  /** 未提交的原因码，便于调用方分支处理。 */
  reason: GrcErrorCode;
  /** 面向人类/readme 的原因说明。 */
  detail: string;
  elapsedMs: number;
}

export type CommitOutcome = CommitSuccess | CommitSkipped;

export interface CommitRequest {
  /** 完整配置，必填：库不读取 ~/.grc，避免隐式全局副作用。 */
  config: AppConfig;
  /** 目标仓库路径，缺省为进程当前工作目录。 */
  repoPath?: string;
  /** true 时只提交已暂存的变更，不执行 git add。 */
  stagedOnly?: boolean;
  /** 本次调用的进度输出槽；缺省沿用全局输出槽（未装配则静默）。 */
  onProgress?: ProgressSink;
  /**
   * 提交前审查门禁的裁决回调。
   * 未提供时不启用审查门禁（库默认非交互）；提供时若 LLM 审查判定可疑则回调裁决，
   * 返回 false 即中止提交并抛 USER_CANCELLED。
   */
  onReview?: (result: ReviewResult) => boolean | Promise<boolean>;
}

/**
 * 提交前把待提交内容放进暂存区：stagedOnly 时沿用已暂存内容，否则 git add 未暂存变更。
 * @param stagedOnly - true 时沿用已暂存内容，false 时执行 git add。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
function stageChanges(stagedOnly: boolean, cwd?: string): void {
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
async function runReviewGate(
  request: CommitRequest,
  cwd?: string,
): Promise<void> {
  const { config, onReview } = request;
  if (!onReview) {
    log.debug("未提供审查回调，跳过审查门禁");
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
 * 执行一次完整的「生成提交信息并提交」流程。
 * @param request - 提交请求：配置、仓库路径、是否仅暂存、审查与进度回调。
 * @throws GrcError 配置缺失、非 git 仓库、无暂存变更、审查否决、生成失败等
 */
export async function executeCommit(
  request: CommitRequest,
): Promise<CommitOutcome> {
  const { config, repoPath, stagedOnly } = request;
  const startTime = performance.now();

  if (!config.apiKey) {
    throw new GrcError(
      "API Key 未设置，请传入 config.apiKey 或运行 `grc init` 进行配置。",
      "CONFIG_MISSING",
    );
  }

  log.trace("开始提交流程", {
    endpoint: config.endpoint,
    model: config.llm.model,
  });

  await measure("校验 git 仓库", () => {
    if (!isGitRepo(repoPath)) {
      throw new GrcError(
        "当前目录不是 git 仓库，请确保在 git 仓库中执行，或指定 repoPath。",
        "NOT_GIT_REPO",
      );
    }
  });

  // 输出槽按调用作用域装配，退出时还原，避免跨调用污染。
  const previousSink = request.onProgress
    ? setProgressSink(request.onProgress)
    : null;
  try {
    await measure("暂存变更", () => stageChanges(!!stagedOnly, repoPath));
    await measure("文件审查门禁", () => runReviewGate(request, repoPath));

    const diff = await measure(
      "提取暂存 diff",
      () => getStagedDiff(repoPath).trim() || null,
    );
    if (!diff) {
      const detail = "没有可提交的变更。";
      log.debug(detail);
      return {
        committed: false,
        reason: "NO_CHANGES",
        detail,
        elapsedMs: performance.now() - startTime,
      };
    }
    log.trace(`暂存 diff 提取完成，长度 ${diff.length} 字符`);

    emitProgress("正在生成提交信息...\n");
    const { message, batchCount } = await measure("生成提交信息", () =>
      generateCommitMessageBatched(diff, config),
    );
    if (batchCount > 1) {
      emitProgress(`  (已将 diff 分为 ${batchCount} 批次处理并合并)\n`);
    }

    await measure("执行 git commit", () => gitCommit(message, repoPath));

    const elapsedMs = performance.now() - startTime;
    log.debug(`全流程完成，总耗时 ${formatElapsed(elapsedMs)}`);
    return { committed: true, message, batchCount, elapsedMs };
  } finally {
    if (request.onProgress) setProgressSink(previousSink);
  }
}
