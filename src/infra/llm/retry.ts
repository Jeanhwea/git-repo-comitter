/**
 * LLM 基础设施 —— 校验重试 + 限流退避。
 *
 * 把「调用 → 校验 → 失败则附修复提示再试」的循环收敛在一处，供各业务域复用。
 * 另外在传输层对可恢复的瞬时错误（429 限流 / 5xx）做退避重试，与「格式校验重试」
 * 使用互相独立的计数器，避免语义混淆（I07）。
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

import { chatCompletion } from "./transport/client";

const log = createLogger("llm");

/** 格式校验失败的最多重试次数（每次换修复提示让模型重新生成）。 */
export const MAX_RETRIES = 3;

/** 传输层限流（429）/ 服务端错误（5xx）的最多重试次数，独立于格式校验重试。 */
export const MAX_RATE_LIMIT_RETRIES = 3;

const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 8000;

export interface ValidatedCallOptions<T> {
  validate: (content: string) => ValidationOutcome<T>;
  label?: string;
  retries?: number;
  temperatureOverride?: number;
  /** 构造「按此修正」的提示文本；由调用方从提示词模块取得后传入。 */
  repairHint: (reason: string) => string;
}

/** 一次传输层异常的分类结论。 */
export interface TransportErrorInfo {
  /** 是否值得退避重试。 */
  retryable: boolean;
  /** 是否为 429 限流（语义上应等待后重试）。 */
  rateLimited: boolean;
  /** 从 Retry-After 解析出的冷却毫秒数（仅限流时可能有值）。 */
  retryAfterMs?: number;
}

/**
 * 分类一次传输层异常：判断是否需要退避重试以及冷却时长。
 * 仅做鸭子类型判断（status / headers），不依赖 openai 的具体类型，便于测试与抽库。
 */
export function classifyTransportError(err: unknown): TransportErrorInfo {
  const status = httpStatusOf(err);
  if (status === undefined) {
    return { retryable: false, rateLimited: false };
  }
  // 429 限流：可重试，且语义上应等待后重试。
  if (status === 429) {
    return {
      retryable: true,
      rateLimited: true,
      retryAfterMs: retryAfterMsOf(err),
    };
  }
  // 5xx / 网关错误：可重试（瞬时服务端故障），但不走「限流」语义。
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { retryable: true, rateLimited: false };
  }
  return { retryable: false, rateLimited: false };
}

function httpStatusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

function retryAfterMsOf(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown })?.headers;
  if (!headers) return undefined;
  let raw: unknown;
  if (headers && typeof (headers as { get?: unknown }).get === "function") {
    raw = (headers as { get(h: string): unknown }).get("retry-after");
  } else if (headers && typeof headers === "object") {
    raw = (headers as Record<string, unknown>)["retry-after"];
  } else {
    return undefined;
  }
  if (raw == null) return undefined;
  const secs = Number(raw);
  if (Number.isNaN(secs)) return undefined;
  // 封顶，避免服务端给出过长冷却导致 CLI 长时间挂起。
  return Math.min(secs, RATE_LIMIT_MAX_DELAY_MS / 1000) * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(
    RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1),
    RATE_LIMIT_MAX_DELAY_MS,
  );
}

/**
 * 带限流退避的传输层调用：命中 429/5xx 时按 Retry-After / 指数退避重试，
 * 重试耗尽后：429 抛 RATE_LIMITED，其余原样上抛。
 */
async function callWithRateLimitRetry(
  config: AppConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  temperatureOverride: number | undefined,
  label: string,
): Promise<string> {
  let rateLimitAttempt = 0;
  for (;;) {
    try {
      return await chatCompletion(config, messages, temperatureOverride);
    } catch (err) {
      const klass = classifyTransportError(err);
      if (!klass.retryable || rateLimitAttempt >= MAX_RATE_LIMIT_RETRIES) {
        if (klass.rateLimited) {
          throw new GrcError(
            `请求过于频繁（${label}），请稍后重试或降低批量规模。`,
            "RATE_LIMITED",
          );
        }
        throw err;
      }
      rateLimitAttempt++;
      const delayMs = klass.retryAfterMs ?? backoffMs(rateLimitAttempt);
      log.debug(
        `限流退避重试（第 ${rateLimitAttempt}/${MAX_RATE_LIMIT_RETRIES} 次），冷却 ${delayMs}ms`,
      );
      emitProgress(
        `  等待限流冷却 ${(delayMs / 1000).toFixed(0)} 秒（第 ${rateLimitAttempt}/${MAX_RATE_LIMIT_RETRIES} 次）...\n`,
      );
      await sleep(delayMs);
    }
  }
}

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
