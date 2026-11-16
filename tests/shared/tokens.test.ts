import { describe, expect, test } from "vitest";

import { estimateTokens } from "@/shared/tokens";

describe("estimateTokens", () => {
  test("英文按每 token 四个字符折算", () => {
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  test("中文按每 token 一点五个字折算，比旧的统一折算法更保守", () => {
    expect(estimateTokens("中".repeat(12))).toBe(8);
    expect(estimateTokens("中".repeat(12))).toBeGreaterThan(6);
  });

  test("中英混排分别折算后相加", () => {
    expect(estimateTokens("中".repeat(12) + "a".repeat(4))).toBe(9);
  });
});
