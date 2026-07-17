import OpenAI from "openai";

import type { AppConfig } from "../../config/types";
import { extractContent } from "./response";

export function createClient(config: AppConfig): OpenAI {
  if (!config.apiKey) {
    throw new Error("apiKey 未设置，请运行 `grc init` 进行配置。");
  }
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.endpoint,
  });
}

export async function chatCompletion(
  config: AppConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  temperatureOverride?: number,
): Promise<string> {
  const client = createClient(config);
  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: temperatureOverride ?? config.llm.temperature,
    max_tokens: config.llm.maxOutputTokens,
    messages,
  });
  return extractContent(response);
}

export async function singleTurn(
  config: AppConfig,
  systemPrompt: string,
  userContent: string,
  temperatureOverride?: number,
): Promise<string> {
  return chatCompletion(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperatureOverride,
  );
}
