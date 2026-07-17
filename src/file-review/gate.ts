import { CliError } from "../cli/errors";
import { question } from "../cli/input";
import type { AppConfig } from "../config/types";
import {
  getNewFileContents,
  getStagedNewFiles,
  hasStagedChanges,
} from "../git/diff";
import { gitReset } from "../git/runner";
import { reviewNewFiles } from "./reviewer";

export async function runReviewGate(
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
      gitReset(stagedToRemove);
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
