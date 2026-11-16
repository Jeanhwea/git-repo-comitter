/**
 * LLM 基础设施 —— 格式校验重试（门面）。
 *
 * 把「调用 → 校验 → 失败则附修复提示再试」的循环收敛在一处，供各业务域复用。
 * 传输层的 429 / 5xx / 网络超时退避已拆到 retry-transport.ts（W6），
 * 本文件保留门面导出，避免所有调用方改 import 路径。
 *
 * 修复提示由调用方必传：面向模型的文本属于提示词（prompts），基础设施不直接引用它，
 * 否则会产生 infra → prompts 的层级回边（架构 A2）。
 */
import type OpenAI from "openai";

import type { AppConfig } from "@/config/types";
import { GrcError } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { emitProgress } from "@/shared/progress";
import { formatElapsed } from "@/shared/time";
import type { ValidationOutcome } from "@/shared/validation";

import { callWithRateLimitRetry } from "./retry-transport";

export {
  callWithRateLimitRetry,
  classifyTransportError,
  MAX_RATE_LIMIT_RETRIES,
  type TransportErrorInfo,
} from "./retry-transport";

const log = createLogger("llm");

/** 格式校验失败的最多重试次数（每次换修复提示让模型重新生成）。 */
export const MAX_RETRIES = 3;

export interface ValidatedCallOptions<T> {
  validate: (content: string) => ValidationOutcome<T>;
  label?: string;
  retries?: number;
  temperatureOverride?: number;
  /** 构造「按此修正」的提示文本；由调用方从提示词模块取得后传入。 */
  repairHint: (reason: string) => string;
}

/**
 * 生成并校验内容：校验失败时追加修复提示重试，耗尽后抛 VALIDATION_FAILED。
 * @param config - 应用配置。
 * @param messages - 初始消息列表（不会被改写）。
 * @param options - 校验器、标签、重试次数与修复提示。
 * @returns 校验通过的值。
 */
export async function callWithValidation<T>(
  config: AppConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  options: ValidatedCallOptions<T>,
): Promise<T> {
  const label = options.label ?? "结果";
  const maxAttempts = options.retries ?? MAX_RETRIES;
  const { repairHint } = options;

  // 复制一份再追加历史，避免改写调用方传入的消息数组。
  const history: OpenAI.ChatCompletionMessageParam[] = [...messages];
  let lastMessage: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (lastMessage === null) {
      log.debug(`生成${label}：第 ${attempt}/${maxAttempts} 次尝试`);
      const t0 = performance.now();
      // 传输层限流退避（独立于格式校验重试）。
      lastMessage = await callWithRateLimitRetry(
        config,
        history,
        options.temperatureOverride,
        label,
      );
      log.trace(`LLM 调用返回，耗时 ${formatElapsed(performance.now() - t0)}`);
      if (!lastMessage) {
        throw new GrcError(`LLM 在生成${label}时返回了空内容。`, "LLM_FAILED");
      }
    }

    history.push({ role: "assistant", content: lastMessage });

    const outcome = options.validate(lastMessage);
    if (outcome.valid) {
      for (const warning of outcome.warnings ?? []) {
        log.debug(`${label}告警: ${warning}`);
        emitProgress(`  提示: ${warning}`);
      }
      return outcome.value;
    }

    if (attempt === maxAttempts) {
      throw new GrcError(
        `${label}格式校验失败（已重试 ${maxAttempts} 次）: ${outcome.reason}\n最后一次生成的${label}：\n${lastMessage}`,
        "VALIDATION_FAILED",
      );
    }

    log.debug(`${label}格式校验未通过（第 ${attempt} 次）: ${outcome.reason}`);
    emitProgress(
      `  ${label}格式校验未通过（第 ${attempt} 次）: ${outcome.reason}`,
    );
    emitProgress("  正在重新生成...\n");
    history.push({
      role: "user",
      content: repairHint(outcome.reason ?? ""),
    });
    lastMessage = null;
  }

  throw new GrcError("意外的错误：重试循环结束后仍未能生成有效结果", "UNKNOWN");
}
