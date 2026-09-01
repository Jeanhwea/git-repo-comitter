import { CliError } from "@/app/cli/errors";
import { question } from "@/app/cli/input";
import type { AppConfig } from "@/infra/config/types";
import { getNewFileContents } from "@/infra/git/diff";

import { reviewNewFiles } from "./reviewer";

export async function runReviewGate(
  config: AppConfig,
  stagedOnly: boolean,
): Promise<void> {
  const newFiles = getNewFileContents(stagedOnly);
  if (newFiles.length === 0) return;

  const result = await reviewNewFiles(newFiles, config);
  if (result.shouldCommit) return;

  console.log("LLM 审查发现以下文件疑似不需要提交：");
  for (const file of result.suspiciousFiles) {
    console.log(`  - ${file}`);
  }
  console.log(`原因：${result.reason}`);

  const answer = await question("是否继续提交？(y/N): ");
  if (!["y", "yes"].includes(answer.toLowerCase())) {
    throw new CliError("用户取消提交。");
  }

  console.log("继续提交...");
}
