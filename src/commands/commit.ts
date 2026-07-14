import { loadConfig } from "../config/loader";
import type { AppConfig } from "../config/types";
import { CliError } from "../errors";
import {
  getNewFileContents,
  getStagedNewFiles,
  hasStagedChanges,
} from "../git/diff";
import { execGit, gitAddAll, gitCommit, isGitRepo } from "../git/runner";
import { generateCommitMessageBatched } from "../llm/batch";
import { reviewNewFiles } from "../llm/reviewer";
import { question } from "../utils/cli";

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

function getChanges(): string | null {
  const output = execGit(["diff", "--cached"], { tolerateError: true });
  return output.trim() || null;
}
async function confirmSuspiciousNewFiles(
  config: AppConfig,
  stagedOnly: boolean,
): Promise<void> {
  const newFiles = getNewFileContents(stagedOnly);
  if (newFiles.length === 0) return;
  const result = await reviewNewFiles(newFiles, config);
  if (!result.shouldCommit) {
    console.log("LLM 审查发现以下文件疑似不需要提交：");
    for (const file of result.suspiciousFiles) {
      console.log(`  - ${file}`);
    }
    console.log(`原因：${result.reason}`);
    const answer = await question("是否排除这些文件并继续提交？(y/N): ");
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      const stagedNewFiles = getStagedNewFiles();
      const stagedToRemove = result.suspiciousFiles.filter((f) =>
        stagedNewFiles.includes(f),
      );
      if (stagedToRemove.length > 0) {
        execGit(["reset", "--", ...stagedToRemove]);
      }
      if (!hasStagedChanges()) {
        throw new CliError("排除所有可疑文件后没有可提交的变更。");
      }
      console.log(
        `已排除 ${result.suspiciousFiles.length} 个文件，继续提交...`,
      );
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
  await confirmSuspiciousNewFiles(config, !!options.stagedOnly);
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
