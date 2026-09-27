/**
 * 聊天补全响应的最小结构描述。
 *
 * 刻意不复用 openai 包的类型：这里只关心「取首个 choice 的文本」这一件事，
 * 且命名带上 Llm 前缀，避免与 openai 官方的 ChatCompletion* 类型混淆。
 */

export interface LlmContentPart {
  type: string;
  text: string;
}

export interface LlmMessage {
  content: string | LlmContentPart[] | null;
}

export interface LlmChoice {
  message: LlmMessage;
}

export interface LlmChatResponse {
  choices: LlmChoice[];
}

/** 取首个 choice 的文本；content 为多段时只拼接 text 段。 */
export function extractContent(response: LlmChatResponse | string): string {
  const data = typeof response === "string" ? JSON.parse(response) : response;
  const content = data.choices?.[0]?.message?.content;
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
