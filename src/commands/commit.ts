import { loadConfig } from "../config/loader";
import type { AppConfig } from "../config/types";
import { CliError } from "../errors";
import { gitAddAll, gitCommit } from "../git/commit";
import {
  getAllDiff,
  getNewFileContents,
  getStagedNewFiles,
  hasStagedChanges,
} from "../git/diff";
import { execGit, isGitRepo } from "../git/runner";
import { reviewNewFiles } from "../llm/reviewer";

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
  const output = getAllDiff();
  return output.trim() || null;
}
async function confirmSuspiciousNewFiles(config: AppConfig): Promise<void> {
  const newFiles = getNewFileContents();
  if (newFiles.length === 0) return;
  const result = await reviewNewFiles(newFiles, config);
  if (!result.shouldCommit) {
    console.log("LLM 审查发现以下文件疑似不需要提交：");
    for (const file of result.suspiciousFiles) {
      console.log(`  - ${file}`);
    }
    console.log(`原因：${result.reason}`);
    const { createInterface } = require("readline/promises");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await rl
      .question("是否排除这些文件并继续提交？(y/N): ")
      .finally(() => rl.close());
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      execGit(["reset", "--", ...result.suspiciousFiles]);
      if (!hasStagedChanges()) {
        throw new CliError("排除所有可疑文件后没有可提交的变更。");
      }
      console.log(`已排除 ${result.suspiciousFiles.length} 个文件，继续提交...`);
    } else {
      throw new CliError("用户取消提交。");
    }
  }
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const config = ensureConfig();
  if (!isGitRepo()) {
    throw new CliError(
      "当前目录不是 git 仓库，请确保在 git 仓库中执行 grc 命令",
    );
  }
  stageOrProceed(!!options.stagedOnly);
  await confirmSuspiciousNewFiles(config);
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
