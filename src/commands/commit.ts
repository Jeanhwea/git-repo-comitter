import { loadConfig } from "../config/loader";
import type { AppConfig } from "../config/types";
import { CliError } from "../errors";
import { gitAddAll, gitCommit } from "../git/commit";
import { getAllDiff, hasStagedChanges } from "../git/diff";
import { generateCommitMessageBatched } from "../llm/batch";

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
  if (hasStagedChanges()) {
    console.log("检出已有暂存变更，直接提交...");
  } else {
    console.log("暂存所有变更...");
    gitAddAll();
  }
}

function getChanges(): string | null {
  const diff = getAllDiff();
  if (!diff.trim()) return null;
  return diff;
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const config = ensureConfig();
  stageOrProceed(!!options.stagedOnly);
  const diff = getChanges();
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
