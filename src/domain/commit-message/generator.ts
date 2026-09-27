import type { AppConfig } from "@/infra/config/types";
import { callWithValidation } from "@/infra/llm/retry";
import { buildMessages, commitMessagePrompt } from "@/prompts";

import { commitMessageRepairHint, validateCommitMessage } from "./checker";

export async function generateCommitMessage(
  diff: string,
  config: AppConfig,
): Promise<string> {
  const messages = buildMessages(commitMessagePrompt, diff);
  return callWithValidation(config, messages, {
    label: "提交信息",
    validate: validateCommitMessage,
    repairHint: commitMessageRepairHint,
  });
}
