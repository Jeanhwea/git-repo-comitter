import { loadConfig } from "../config/loader";
import type { AppConfig } from "../config/types";
import { getAllDiff, hasStagedChanges } from "../git/diff";
import { gitCommit, gitAddAll } from "../git/commit";
import { generateCommitMessage } from "../llm/client";

function ensureConfig(): AppConfig {
  const config = loadConfig();
  if (!config.apiKey) {
    console.error("错误：LLM_API_KEY 未设置，请运行 `grc init` 进行配置。");
    process.exit(1);
  }
  return config;
}

function stageOrProceed(): void {
  if (hasStagedChanges()) {
    console.log("检出已有暂存变更，直接提交...");
  } else {
    console.log("暂存所有变更...");
    gitAddAll();
  }
}

function getChanges(): string {
  const diff = getAllDiff();
  if (!diff.trim()) {
    console.log("没有可提交的变更。");
    process.exit(0);
  }
  return diff;
}

export async function runCommit(): Promise<void> {
  const config = ensureConfig();
  stageOrProceed();
  const diff = getChanges();
  console.log("正在生成提交信息...\n");
  const message = await generateCommitMessage(diff, config);
  gitCommit(message);
  console.log(`提交信息：\n  ${message}\n`);
  console.log("提交成功！");
}
