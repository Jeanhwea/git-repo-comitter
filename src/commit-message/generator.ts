import type OpenAI from "openai";

import type { AppConfig } from "../config/types";
import { type ValidationOutcome, callWithValidation } from "../llm/retry";
import { validateCommitMessage } from "./checker";
import { SYSTEM_PROMPT } from "./prompts";

export const commitMessageValidator = (
  content: string,
): ValidationOutcome<string> => {
  const result = validateCommitMessage(content);
  return result.valid
    ? { valid: true, value: content }
    : { valid: false, reason: result.reason };
};

export const commitMessageRepairHint = (reason: string): string =>
  `生成的提交信息格式不符合规范：${reason}。请严格按照 Conventional Commits 格式重新生成。`;

export async function generateCommitMessage(
  diff: string,
  config: AppConfig,
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `以下是 Git diff 内容：\n\n${diff}` },
  ];
  return callWithValidation(config, messages, {
    label: "提交信息",
    validate: commitMessageValidator,
    repairHint: commitMessageRepairHint,
  });
}
