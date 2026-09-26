import type OpenAI from "openai";

import type { AppConfig } from "@/infra/config/types";
import { callWithValidation } from "@/infra/llm/retry";

import { commitMessageRepairHint, validateCommitMessage } from "./checker";
import { SYSTEM_PROMPT, wrapDiff } from "./prompts";

export async function generateCommitMessage(
  diff: string,
  config: AppConfig,
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: wrapDiff(diff) },
  ];
  return callWithValidation(config, messages, {
    label: "提交信息",
    validate: validateCommitMessage,
    repairHint: commitMessageRepairHint,
  });
}
