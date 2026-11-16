import { describe, expect, test } from "vitest";

import type { AppConfig } from "@/config/types";
import { effectiveLimit, fitDraftsWithinBudget } from "@/infra/llm/budget";

function config(): AppConfig {
  return {
    apiKey: "k",
    endpoint: "https://example.com/v1",
    llm: {
      model: "m",
      temperature: 0,
      maxInputTokens: 1000,
      maxOutputTokens: 100,
    },
  };
}

describe("fitDraftsWithinBudget", () => {
  test("超长草稿放在中间时保留首尾而不是只留前部", () => {
    const parts = ["短", "短", "很长的草稿".repeat(20), "尾"];
    const result = fitDraftsWithinBudget(parts, 10);
    expect(result.head).toEqual(["短", "短"]);
    expect(result.tail).toEqual(["尾"]);
    expect(result.omitted).toBe(1);
  });

  test("全部可容纳时不省略任何草稿", () => {
    const result = fitDraftsWithinBudget(["甲", "乙"], 100);
    expect(result.head).toEqual(["甲", "乙"]);
    expect(result.tail).toEqual([]);
    expect(result.omitted).toBe(0);
  });
});

describe("effectiveLimit", () => {
  test("扣除系统提示词、输出额度与 15% 安全余量", () => {
    const limit = effectiveLimit(config(), "x");
    expect(limit).toBeLessThan(699);
    expect(limit).toBeGreaterThan(580);
  });
});
