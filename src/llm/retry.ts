import type OpenAI from "openai";

import type { AppConfig } from "../config/types";
import { chatCompletion } from "./transport/client";

export const MAX_RETRIES = 3;

export interface ValidationOutcome<T> {
  valid: boolean;
  value?: T;
  reason?: string;
}

export interface ValidatedCallOptions<T> {
  validate: (content: string) => ValidationOutcome<T>;
  label?: string;
  retries?: number;
  initialMessage?: string;
  temperatureOverride?: number;
  repairHint?: (reason: string) => string;
}

export async function callWithValidation<T>(
  config: AppConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  options: ValidatedCallOptions<T>,
): Promise<T> {
  const label = options.label ?? "结果";
  const maxAttempts = options.retries ?? MAX_RETRIES;
  const repairHint =
    options.repairHint ??
    ((reason) =>
      `生成的${label}格式不符合规范：${reason}。请严格按照规范重新生成。`);
  let lastMessage: string | null = options.initialMessage ?? null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (lastMessage === null) {
      lastMessage = await chatCompletion(
        config,
        messages,
        options.temperatureOverride,
      );
      if (!lastMessage) {
        throw new Error(`LLM 在生成${label}时返回了空内容。`);
      }
    }

    messages.push({ role: "assistant", content: lastMessage });

    const outcome = options.validate(lastMessage);
    if (outcome.valid) return outcome.value as T;

    if (attempt < maxAttempts) {
      console.log(
        `  ${label}格式校验未通过（第 ${attempt} 次）: ${outcome.reason}`,
      );
      console.log("  正在重新生成...\n");
      messages.push({
        role: "user",
        content: repairHint(outcome.reason ?? ""),
      });
      lastMessage = null;
    } else {
      throw new Error(
        `${label}格式校验失败（已重试 ${maxAttempts} 次）: ${outcome.reason}\n最后一次生成的${label}：\n${lastMessage}`,
      );
    }
  }

  throw new Error("意外的错误：重试循环结束后仍未能生成有效结果");
}
