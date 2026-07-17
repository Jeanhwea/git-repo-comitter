import { CliError } from "../cli/errors";
import { generateCommitMessageBatched } from "../commit-message/batch";
import { loadConfig } from "../config/loader";
import type { AppConfig } from "../config/types";
import { runReviewGate } from "../file-review/gate";
import { getStagedDiff, hasStagedChanges } from "../git/diff";
import { gitAddAll, gitCommit, isGitRepo } from "../git/runner";

export interface CommitOptions {
  stagedOnly?: boolean;
}

function ensureConfig(): AppConfig {
  const config = loadConfig();
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
  console.log("暂存所有变更...");
  gitAddAll();
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const config = ensureConfig();
  if (!isGitRepo()) {
    throw new CliError(
      "当前目录不是 git 仓库，请确保在 git 仓库中执行 grc 命令",
    );
  }
  stageOrProceed(!!options.stagedOnly);
  await runReviewGate(config, !!options.stagedOnly);
  const diff = getStagedDiff().trim() || null;
  if (!diff) {
    console.log("没有可提交的变更。");
    return;
  }
  console.log("正在生成提交信息...\n");
  const { message, batchCount } = await generateCommitMessageBatched(
    diff,
    config,
  );
  if (batchCount > 1) {
    console.log(`  (已将 diff 分为 ${batchCount} 批次处理并合并)\n`);
  }
  gitCommit(message);
  console.log(`提交信息：\n  ${message}\n`);
  console.log("提交成功！");
}
