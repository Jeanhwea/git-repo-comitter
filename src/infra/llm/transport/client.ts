import OpenAI from "openai";

import type { AppConfig } from "@/infra/config/types";
import { formatElapsed } from "@/utils/format-time";
import { createLogger } from "@/utils/logger";

import { extractContent } from "./response";

const log = createLogger("llm");

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
  log.trace(
    `调用 LLM model=${config.llm.model} temperature=${temperatureOverride ?? config.llm.temperature} 消息数=${messages.length}`,
  );
  const t0 = performance.now();
  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: temperatureOverride ?? config.llm.temperature,
    max_tokens: config.llm.maxOutputTokens,
    messages,
  });
  log.trace(`LLM 返回耗时 ${formatElapsed(performance.now() - t0)}`);
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
