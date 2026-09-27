/**
 * 领域层 —— 单批提交信息生成。
 *
 * 职责：取提示词、组装消息、交给 LLM 校验重试。消息组装由 prompts.buildMessages 统一完成。
 */
import type { AppConfig } from "@/config/types";
import { callWithValidation } from "@/infra/llm/retry";
import {
  buildMessages,
  commitMessagePrompt,
  commitMessageRepairHint,
} from "@/prompts";

import { validateCommitMessage } from "./checker";

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
