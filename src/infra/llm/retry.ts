import type OpenAI from "openai";

import type { AppConfig } from "@/infra/config/types";
import { formatElapsed } from "@/utils/format-time";
import { createLogger } from "@/utils/logger";

import { chatCompletion } from "./transport/client";

const log = createLogger("llm");

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
      `上一次输出的${label}未通过校验：${reason}。必须严格按照系统提示词的要求重新生成：只输出结果本身，禁止添加任何解释或代码围栏；输出语言必须与系统提示词的要求一致。`);
  let lastMessage: string | null = options.initialMessage ?? null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (lastMessage === null) {
      log.debug(`生成${label}：第 ${attempt}/${maxAttempts} 次尝试`);
      const t0 = performance.now();
      lastMessage = await chatCompletion(
        config,
        messages,
        options.temperatureOverride,
      );
      log.trace(`LLM 调用返回，耗时 ${formatElapsed(performance.now() - t0)}`);
      if (!lastMessage) {
        throw new Error(`LLM 在生成${label}时返回了空内容。`);
      }
    }

    messages.push({ role: "assistant", content: lastMessage });

    const outcome = options.validate(lastMessage);
    if (outcome.valid) return outcome.value as T;

    if (attempt < maxAttempts) {
      log.debug(
        `${label}格式校验未通过（第 ${attempt} 次）: ${outcome.reason}`,
      );
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
