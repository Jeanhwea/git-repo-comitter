/**
 * LLM 基础设施 —— 传输层。
 *
 * 只做两件事：按配置构造客户端、发起一次聊天补全并抽取文本。
 * 原先自带的 singleTurn 自行组装 system+user 消息，与 prompts.buildMessages
 * 形成两套消息组装（I06 的 P5），已删除，统一由提示词模块组装后传入。
 */
import OpenAI from "openai";

import type { AppConfig } from "@/config/types";
import { createLogger } from "@/shared/logger";
import { formatElapsed } from "@/shared/time";

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
