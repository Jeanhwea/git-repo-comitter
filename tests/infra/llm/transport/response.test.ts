/**
 * LLM 响应解析回归测试（W4）：非法 JSON、空 choices、截断与拒答
 * 都必须得到稳定的 LLM_FAILED 错误码，而不是 SyntaxError 或空字符串。
 */
import { describe, expect, test } from "vitest";

import { GrcError } from "@/shared/errors";
import { extractContent } from "@/infra/llm/transport/response";

function reply(extra: Record<string, unknown> = {}) {
  return {
    choices: [
      { message: { content: "  提交信息  " }, finish_reason: "stop", ...extra },
    ],
  };
}

function expectLlmFailed(run: () => unknown): void {
  try {
    run();
    throw new Error("应当抛出 GrcError");
  } catch (err) {
    expect(err).toBeInstanceOf(GrcError);
    expect((err as GrcError).code).toBe("LLM_FAILED");
  }
}

describe("extractContent", () => {
  test("合法对象与 JSON 字符串都能取到文本", () => {
    expect(extractContent(reply())).toBe("提交信息");
    expect(extractContent(JSON.stringify(reply()))).toBe("提交信息");
  });

  test("多段 content 只拼接 text 段", () => {
    const response = {
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "第一部分" },
              { type: "refusal", text: "忽略" },
              { type: "text", text: "第二部分" },
            ],
          },
        },
      ],
    };
    expect(extractContent(response)).toBe("第一部分第二部分");
  });

  test("非法 JSON 字符串转换为 GrcError(LLM_FAILED)", () => {
    expectLlmFailed(() => extractContent("{not json"));
  });

  test("choices 为空或响应缺少 choices 时抛出稳定错误", () => {
    expectLlmFailed(() => extractContent({ choices: [] }));
    expectLlmFailed(() => extractContent("null"));
  });

  test("finish_reason 为 length 时提示截断", () => {
    expectLlmFailed(() => extractContent(reply({ finish_reason: "length" })));
  });

  test("模型拒答时抛出稳定错误", () => {
    expectLlmFailed(() => extractContent(reply({ refusal: "不能生成" })));
  });
});
