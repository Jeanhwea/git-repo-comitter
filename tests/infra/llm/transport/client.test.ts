/**
 * infra/llm/transport/client 的单元测试：apiKey 缺失时的报错、
 * 浏览器环境下 dangerouslyAllowBrowser 的放行探测，以及响应文本的提取。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// 在被测模块导入前 mock openai，捕获构造 OpenAI 客户端时传入的配置。
const { captured } = vi.hoisted(() => {
  const captured: any[] = [];
  return { captured };
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(public config: any) {
      captured.push(config);
    }
    chat = {
      completions: {
        create: async () => ({ choices: [{ message: { content: "ok" } }] }),
      },
    };
  },
}));

import type { AppConfig } from "@/config/types";

import { chatCompletion } from "@/infra/llm/transport/client";

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

describe("infra/llm/transport/client (F07 浏览器放行探测)", () => {
  beforeEach(() => {
    captured.length = 0;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  test("缺少 apiKey 时抛 GrcError(CONFIG_MISSING)", async () => {
    const cfg = baseConfig();
    cfg.apiKey = "";
    await expect(chatCompletion(cfg, [])).rejects.toMatchObject({
      code: "CONFIG_MISSING",
    });
  });

  test("Node 环境下构造 OpenAI 时不带 dangerouslyAllowBrowser", async () => {
    await chatCompletion(baseConfig(), []);
    expect(captured.length).toBe(1);
    expect(captured[0].dangerouslyAllowBrowser).toBeFalsy();
  });

  test("浏览器环境（window + document）下构造 OpenAI 时带 dangerouslyAllowBrowser: true", async () => {
    (globalThis as any).window = {} as any;
    (globalThis as any).document = {} as any;
    await chatCompletion(baseConfig(), []);
    expect(captured.length).toBe(1);
    expect(captured[0].dangerouslyAllowBrowser).toBe(true);
  });

  test("调用返回提取后的文本内容", async () => {
    const out = await chatCompletion(baseConfig(), []);
    expect(out).toBe("ok");
  });
});
