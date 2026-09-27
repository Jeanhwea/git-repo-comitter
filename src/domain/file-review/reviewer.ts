/**
 * 领域层 —— 提交前文件审查调用。
 *
 * 职责：取提示词、组装消息、交给 LLM 校验重试并产出审查结论。
 * 校验规则已拆到 ./checker，交互提问与取消提交已上移到 app/steps/review（I06 的 P1/P6）。
 */
import type { AppConfig } from "@/config/types";
import { callWithValidation } from "@/infra/llm/retry";
import { type NewFileContent, buildMessages, reviewPrompt } from "@/prompts";
import { createLogger } from "@/shared/logger";

import { type ReviewResult, validateReviewResult } from "./checker";

export type { ReviewResult };

const log = createLogger("review");

export async function reviewNewFiles(
  newFileContents: NewFileContent[],
  config: AppConfig,
): Promise<ReviewResult> {
  const messages = buildMessages(reviewPrompt, newFileContents);

  log.debug(`开始审查 ${newFileContents.length} 个新增文件`);
  const result = await callWithValidation<ReviewResult>(config, messages, {
    label: "审查结果",
    temperatureOverride: 0,
    validate: validateReviewResult,
    repairHint: reviewPrompt.repairHint,
  });
  log.trace("审查结论", {
    shouldCommit: result.shouldCommit,
    suspiciousFiles: result.suspiciousFiles,
    reason: result.reason,
  });
  return result;
}
