/**
 * 应用层 —— commit 命令：串联配置校验、暂存、审查门禁、生成提交信息与提交。
 */
import { runReviewGate } from "@/app/steps/review";
import { loadConfig } from "@/config/loader";
import type { AppConfig } from "@/config/types";
import { generateCommitMessageBatched } from "@/domain/commit-message/batch";
import { hasChangesToStage, hasStagedChanges } from "@/infra/git/changes";
import { getStagedDiff } from "@/infra/git/diff";
import { gitAddAll, gitCommit, isGitRepo } from "@/infra/git/repo";
import { CliError } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { formatElapsed } from "@/shared/time";

const log = createLogger("commit");

export interface CommitOptions {
  stagedOnly?: boolean;
}

async function ensureConfig(): Promise<AppConfig> {
  const config = await loadConfig();
  if (!config.apiKey) {
    throw new CliError("API Key 未设置，请运行 `grc init` 进行配置。");
  }
  return config;
}

function stageOrProceed(stagedOnly: boolean): void {
  if (stagedOnly) {
    if (!hasStagedChanges()) {
      throw new CliError("没有已暂存的变更，请先使用 git add 暂存文件。");
    }
    console.log("仅提交暂存变更...");
    return;
  }
  if (hasChangesToStage()) {
    console.log("暂存所有变更...");
    gitAddAll();
  }
}

/** 按步骤记录耗时：统一「开始 / 完成」日志，避免每步重复取样。 */
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

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const startTime = performance.now();

  const config = await measure("加载配置", ensureConfig);
  log.trace("已加载配置", {
    endpoint: config.endpoint,
    model: config.llm.model,
  });

  await measure("校验 git 仓库", () => {
    if (!isGitRepo()) {
      throw new CliError(
        "当前目录不是 git 仓库，请确保在 git 仓库中执行 grc 命令",
      );
    }
  });

  await measure("暂存变更", () => stageOrProceed(!!options.stagedOnly));
  await measure("文件审查门禁", () => runReviewGate(config, !!options.stagedOnly));

  const diff = await measure("提取暂存 diff", () => getStagedDiff().trim() || null);
  if (!diff) {
    console.log("没有可提交的变更。");
    return;
  }
  log.trace(`暂存 diff 提取完成，长度 ${diff.length} 字符`);

  console.log("正在生成提交信息...\n");
  const { message, batchCount } = await measure("生成提交信息", () =>
    generateCommitMessageBatched(diff, config),
  );
  if (batchCount > 1) {
    console.log(`  (已将 diff 分为 ${batchCount} 批次处理并合并)\n`);
  }

  await measure("执行 git commit", () => gitCommit(message));

  console.log(`提交信息：\n  ${message}\n`);
  const elapsed = performance.now() - startTime;
  log.debug(`全流程完成，总耗时 ${formatElapsed(elapsed)}`);
  console.log(`提交成功！耗时 ${formatElapsed(elapsed)}`);
}
