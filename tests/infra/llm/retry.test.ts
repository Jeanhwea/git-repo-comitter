/**
 * infra/llm/retry 的单元测试：传输层异常的限流分类，以及 429 退避重试行为。
 *
 * 通过 mock 掉 transport/client 的 chatCompletion，避免真实网络调用；
 * 退避用的 setTimeout 由 fake timers 接管，使重试可在不等待真实秒数的情况下验证。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/infra/llm/transport/client", () => ({
  chatCompletion: vi.fn(),
}));

import type { AppConfig } from "@/config/types";
import { GrcError } from "@/shared/errors";
import { emitProgress, setProgressSink } from "@/shared/progress";

import {
  callWithValidation,
  classifyTransportError,
  MAX_RATE_LIMIT_RETRIES,
} from "@/infra/llm/retry";
import { chatCompletion } from "@/infra/llm/transport/client";

const chat = chatCompletion as unknown as ReturnType<typeof vi.fn>;

function baseConfig(): AppConfig {
  return {
    apiKey: "sk-test",
    endpoint: "https://api.openai.com/v1",
    llm: {
      model: "m",
      temperature: 0.5,
      maxInputTokens: 100,
      maxOutputTokens: 50,
    },
  };
}

function makeError(status: number, retryAfter?: string): Error {
  const headers =
    retryAfter === undefined
      ? {}
      : {
          get: (h: string) =>
            h.toLowerCase() === "retry-after" ? retryAfter : null,
        };
  return Object.assign(new Error(`status ${status}`), { status, headers });
}

describe("classifyTransportError", () => {
  test("429 带 Retry-After 头 -> rateLimited + retryAfterMs", () => {
    const info = classifyTransportError(makeError(429, "2"));
    expect(info).toMatchObject({ retryable: true, rateLimited: true });
    expect(info.retryAfterMs).toBe(2000);
  });

  test("429 无头 -> rateLimited，无 retryAfterMs", () => {
    const info = classifyTransportError(makeError(429));
    expect(info.retryable).toBe(true);
    expect(info.rateLimited).toBe(true);
    expect(info.retryAfterMs).toBeUndefined();
  });

  test("5xx -> retryable 但非 rateLimited", () => {
    for (const s of [500, 502, 503, 504]) {
      const info = classifyTransportError(makeError(s));
      expect(info.retryable).toBe(true);
      expect(info.rateLimited).toBe(false);
    }
  });

  test("401 / 403 -> 不可重试", () => {
    expect(classifyTransportError(makeError(401)).retryable).toBe(false);
    expect(classifyTransportError(makeError(403)).retryable).toBe(false);
  });

  test("普通 Error / 非对象 -> 不可重试", () => {
    expect(classifyTransportError(new Error("boom"))).toMatchObject({
      retryable: false,
      rateLimited: false,
    });
    expect(classifyTransportError("not an error")).toMatchObject({
      retryable: false,
      rateLimited: false,
    });
  });
});

describe("callWithValidation 限流退避", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    setProgressSink(null);
  });

  test("429 重试若干次后成功返回", async () => {
    chat
      .mockRejectedValueOnce(makeError(429))
      .mockRejectedValueOnce(makeError(429))
      .mockResolvedValueOnce("ok");
    const p = callWithValidation(baseConfig(), [], {
      validate: () => ({ valid: true, value: "ok" }),
      repairHint: () => "",
    });
    // 标记已处理，避免 runAllTimersAsync 期间的未处理拒绝告警。
    void p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(chat).toHaveBeenCalledTimes(3);
  });

  test("429 持续触发 -> 抛 RATE_LIMITED（共调用 MAX+1 次，并提示冷却）", async () => {
    chat.mockRejectedValue(makeError(429));
    const messages: string[] = [];
    setProgressSink((m) => messages.push(m));
    const p = callWithValidation(baseConfig(), [], {
      validate: () => ({ valid: true, value: "ok" }),
      repairHint: () => "",
    });
    void p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(GrcError);
    const err = await p.catch((e) => e);
    expect((err as GrcError).code).toBe("RATE_LIMITED");
    expect(chat).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
    expect(messages.some((m) => m.includes("等待限流冷却"))).toBe(true);
  });
});
