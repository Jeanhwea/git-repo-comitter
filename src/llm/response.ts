import type { CreateChatCompletionResponse } from "openai/api";


export function extractContent(
  response: CreateChatCompletionResponse | string,
): string {
  const data = typeof response === "string" ? JSON.parse(response) : response;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return "";
}

