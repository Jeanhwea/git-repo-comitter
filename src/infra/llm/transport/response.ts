/**
 * 聊天补全响应的最小结构描述。
 *
 * 刻意不复用 openai 包的类型：这里只关心「取首个 choice 的文本」这一件事，
 * 且命名带上 Llm 前缀，避免与 openai 官方的 ChatCompletion* 类型混淆。
 */
import { GrcError } from "@/shared/errors";

interface LlmContentPart {
  type: string;
  text: string;
}

interface LlmMessage {
  content: string | LlmContentPart[] | null;
}

interface LlmChoice {
  message: LlmMessage;
  finish_reason?: string | null;
  refusal?: string | null;
}

interface LlmChatResponse {
  choices: LlmChoice[];
}

/**
 * 解析响应：字符串分支必须容忍非法 JSON，转成稳定的 GrcError。
 * @param response - 原始响应对象或 JSON 字符串。
 */
function parseResponse(response: LlmChatResponse | string): LlmChatResponse {
  if (typeof response !== "string") return response;
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch (err) {
    throw new GrcError(
      `LLM 响应不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      "LLM_FAILED",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as LlmChatResponse).choices)
  ) {
    throw new GrcError("LLM 响应缺少 choices 数组。", "LLM_FAILED");
  }
  return parsed as LlmChatResponse;
}

/**
 * 取首个 choice 的文本；content 为多段时只拼接 text 段。
 * @param response - LLM 原始响应对象或未经解析的 JSON 字符串。
 */
export function extractContent(response: LlmChatResponse | string): string {
  const data = parseResponse(response);
  const choice = data.choices?.[0];
  if (!choice) {
    throw new GrcError(
      "LLM 响应中没有 choices，无法取得生成内容。",
      "LLM_FAILED",
    );
  }
  if (choice.finish_reason === "length") {
    throw new GrcError(
      "LLM 输出被最大 token 数截断，请增大 maxOutputTokens 或精简输入。",
      "LLM_FAILED",
    );
  }
  if (choice.refusal) {
    throw new GrcError(
      `LLM 拒绝生成内容：${choice.refusal.slice(0, 200)}`,
      "LLM_FAILED",
    );
  }
  const content = choice.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
  }
  return "";
}
