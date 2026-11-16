import { describe, expect, test } from "vitest";

import { displayWidth, truncateToWidth } from "@/shared/text";

describe("displayWidth", () => {
  test("中文与全角标点按两个半角宽计", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("中文")).toBe(4);
    expect(displayWidth("修复，")).toBe(6);
  });
});

describe("truncateToWidth", () => {
  test("按宽度截断且不会切出超宽结果", () => {
    expect(truncateToWidth("abcdef", 4)).toBe("abcd");
    expect(truncateToWidth("修复登录问题", 5)).toBe("修复");
    expect(
      displayWidth(truncateToWidth("修复登录问题", 5)),
    ).toBeLessThanOrEqual(5);
  });
});
