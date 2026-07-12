import { createInterface } from "readline/promises";

export interface MessageContentPart {
  type: string;
  text: string;
}

export interface ChatCompletionMessage {
  content: string | MessageContentPart[] | null;
}

export interface ChatCompletionChoice {
  message: ChatCompletionMessage;
}

export interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
}

export function extractContent(
  response: ChatCompletionResponse | string,
): string {
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

export function question(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return rl.question(query).finally(() => rl.close());
}
