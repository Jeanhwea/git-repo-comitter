/**
 * 应用层 —— 审查门禁步骤。
 *
 * 由 domain/file-review/gate.ts 上移而来（I06 的 P1）：本步骤需要向用户提问并在被拒绝时
 * 终止进程，属于用户交互与流程控制，不应放在领域层。领域层只保留 reviewNewFiles 的
 * 纯审查能力，因此 domain → app 的回边被彻底消除。
 */
import type { AppConfig } from "@/config/types";
import { reviewNewFiles } from "@/domain/file-review/reviewer";
import { getNewFileContents } from "@/infra/git/changes";
import { CliError } from "@/shared/errors";
import { question } from "@/shared/input";
import { createLogger } from "@/shared/logger";

const log = createLogger("review");

export async function runReviewGate(
  config: AppConfig,
  stagedOnly: boolean,
): Promise<void> {
  const newFiles = getNewFileContents(stagedOnly);
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
