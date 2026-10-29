/**
 * config/loader 的单元测试：默认值的深拷贝隔离、clampLlm 对超限字段的收敛与报告，
 * 以及 resolveConfig 的合并与回落策略。
 */
import { describe, expect, test } from "vitest";

import {
  DEFAULT_CONFIG,
  clampLlm,
  loadDefaultConfig,
  resolveConfig,
} from "@/config/loader";

describe("config/loader (F07 纯函数配置层)", () => {
  test("loadDefaultConfig 返回深拷贝且各实例不共享引用", () => {
    const a = loadDefaultConfig();
    const b = loadDefaultConfig();
    expect(a).toEqual(DEFAULT_CONFIG);
    expect(a).not.toBe(DEFAULT_CONFIG);
    expect(a.llm).not.toBe(DEFAULT_CONFIG.llm);
    // 修改一份不影响另一份 / 默认值
    a.llm.model = "changed";
    expect(b.llm.model).toBe(DEFAULT_CONFIG.llm.model);
  });

  test("clampLlm: maxOutputTokens 超限时收敛并报告 outputExceeded", () => {
    const r = clampLlm({ maxOutputTokens: 99999 });
    expect(r.llm.maxOutputTokens).toBe(DEFAULT_CONFIG.llm.maxOutputTokens);
    expect(r.outputExceeded).toEqual({
      userValue: 99999,
      limit: DEFAULT_CONFIG.llm.maxOutputTokens,
    });
  });

  test("clampLlm: maxInputTokens 超限时收敛并报告 inputExceeded", () => {
    const r = clampLlm({ maxInputTokens: 999999 });
    expect(r.llm.maxInputTokens).toBe(DEFAULT_CONFIG.llm.maxInputTokens);
    expect(r.inputExceeded).not.toBeNull();
    expect(r.inputExceeded!.userValue).toBe(999999);
    expect(r.inputExceeded!.limit).toBe(DEFAULT_CONFIG.llm.maxInputTokens);
  });

  test("clampLlm: 未超限时不报告 exceeded", () => {
    const r = clampLlm({ maxOutputTokens: 100, maxInputTokens: 100 });
    expect(r.outputExceeded).toBeNull();
    expect(r.inputExceeded).toBeNull();
    expect(r.llm.maxOutputTokens).toBe(100);
    expect(r.llm.maxInputTokens).toBe(100);
  });

  test("clampLlm: 缺省入参回落到内置默认值", () => {
    const r = clampLlm(undefined);
    expect(r.llm).toEqual(DEFAULT_CONFIG.llm);
    expect(r.outputExceeded).toBeNull();
    expect(r.inputExceeded).toBeNull();
  });

  test("resolveConfig: 缺省时全部字段回落到默认值", () => {
    const cfg = resolveConfig();
    expect(cfg.endpoint).toBe(DEFAULT_CONFIG.endpoint);
    expect(cfg.apiKey).toBe("");
    expect(cfg.llm).toEqual(DEFAULT_CONFIG.llm);
  });

  test("resolveConfig: 覆盖 apiKey / endpoint / llm 字段", () => {
    const cfg = resolveConfig({
      apiKey: "sk-test",
      endpoint: "https://example.com/v1",
      llm: {
        model: "custom-model",
        temperature: 0.2,
        maxInputTokens: 100,
        maxOutputTokens: 50,
      },
    });
    expect(cfg.apiKey).toBe("sk-test");
    expect(cfg.endpoint).toBe("https://example.com/v1");
    expect(cfg.llm.model).toBe("custom-model");
    expect(cfg.llm.temperature).toBe(0.2);
  });

  test("resolveConfig: apiKey 缺省时回退空串而非 undefined", () => {
    const cfg = resolveConfig({ endpoint: "https://x/v1" });
    expect(cfg.apiKey).toBe("");
  });

  test("resolveConfig: llm 超限时被静默收敛", () => {
    const cfg = resolveConfig({ llm: { maxOutputTokens: 99999 } });
    expect(cfg.llm.maxOutputTokens).toBe(DEFAULT_CONFIG.llm.maxOutputTokens);
  });
});
