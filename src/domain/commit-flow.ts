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
 *
 * 本文件只做编排与公共 API 汇总，阶段实现拆到 ./commit-flow/ 子模块：
 * - types.ts   公共数据契约（CommitRequest / CommitOutcome ...）
 * - stages.ts  计时工具与四个阶段函数（stage/review/fallback/commitChecked）
 *
 * 保持 executeCommit 与类型的导出签名不变，调用方零改动。
 */
import { getStagedDiff } from "@/infra/git/diff";
import { isGitRepo } from "@/infra/git/repo";
import { GrcError } from "@/shared/errors";
import { emitProgress, setProgressSink } from "@/shared/progress";
import { formatElapsed } from "@/shared/time";

import {
  commitChecked,
  generateWithFallback,
  log,
  measure,
  runReviewGate,
  stageChanges,
  tryFallback,
} from "./commit-flow/stages";
import type { CommitOutcome, CommitRequest } from "./commit-flow/types";

export type {
  CommitSuccess,
  CommitSkipped,
  CommitOutcome,
  CommitRequest,
} from "./commit-flow/types";

/**
 * 执行一次完整的「生成提交信息并提交」流程。
 *
 * P1 / P2 / 正常生成三条路径共用同一套仓库校验、暂存、diff 提取与提交门禁，
 * 差异只在「消息怎么来」；因此 CLI 与库在 apiKey 为空时行为一致。
 * @param request - 提交请求：配置、仓库路径、是否仅暂存、审查与进度回调。
 * @throws GrcError 非 git 仓库、无暂存变更、审查否决、校验失败、生成失败等
 */
export async function executeCommit(
  request: CommitRequest,
): Promise<CommitOutcome> {
  const { config, repoPath, stagedOnly, noVerify } = request;
  const startTime = performance.now();

  // 输出槽按调用作用域装配，退出时还原，避免跨调用污染。
  const previousSink = request.onProgress
    ? setProgressSink(request.onProgress)
    : null;
  try {
    await measure("校验 git 仓库", () => {
      if (!isGitRepo(repoPath)) {
        throw new GrcError(
          "当前目录不是 git 仓库，请确保在 git 仓库中执行，或指定 repoPath。",
          "NOT_GIT_REPO",
        );
      }
    });
    await measure("暂存变更", () => stageChanges(!!stagedOnly, repoPath));

    if (config.apiKey) {
      log.trace("开始提交流程", {
        endpoint: config.endpoint,
        model: config.llm.model,
      });
      await measure("文件审查门禁", () => runReviewGate(request, repoPath));
    } else {
      emitProgress("未配置 LLM，使用规则化模式生成提交信息...\n");
      emitProgress("  (已降级：提交消息由规则生成，不含 AI 语义分析)\n");
      log.debug("apiKey 为空，跳过依赖 LLM 的审查门禁");
    }

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
    let message: string;
    let batchCount = 1;
    let isFallback = false;
    if (!config.apiKey) {
      // P1：无 API Key，规则化生成
      message = await measure("生成提交信息（规则化）", () =>
        tryFallback(repoPath),
      );
      isFallback = true;
    } else {
      const generated = await generateWithFallback(diff, config, repoPath);
      message = generated.message;
      batchCount = generated.batchCount;
      isFallback = generated.isFallback;
      if (batchCount > 1) {
        emitProgress(`  (已将 diff 分为 ${batchCount} 批次处理并合并)\n`);
      }
    }

    if (isFallback) {
      emitProgress(
        "  (提示：降级消息缺乏语义分析，可通过 git commit --amend 手动编辑)\n",
      );
    }

    await measure("提交前校验与 git commit", () =>
      commitChecked(message, repoPath, noVerify),
    );

    const elapsedMs = performance.now() - startTime;
    log.debug(`全流程完成，总耗时 ${formatElapsed(elapsedMs)}`);
    return { committed: true, message, batchCount, elapsedMs };
  } finally {
    if (request.onProgress) setProgressSink(previousSink);
  }
}
