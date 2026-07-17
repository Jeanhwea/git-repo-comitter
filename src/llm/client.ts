import OpenAI from "openai";

import type { AppConfig } from "../config/types";
import { validateCommitMessage } from "./checker";
import { SYSTEM_PROMPT } from "./prompts";
import { extractContent } from "./response";

export const MAX_RETRIES = 3;

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

export async function retryWithValidation(
  config: AppConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: { initialMessage?: string; label?: string },
): Promise<string> {
  const label = options?.label ?? "提交信息";
  let lastMessage: string | null = options?.initialMessage ?? null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (lastMessage === null) {
      lastMessage = await chatCompletion(config, messages);
      if (!lastMessage) {
        throw new Error(`LLM 在生成${label}时返回了空内容。`);
      }
    }

    messages.push({ role: "assistant", content: lastMessage });

    const validation = await validateCommitMessage(lastMessage);
    if (validation.valid) return lastMessage;

    if (attempt < MAX_RETRIES) {
      console.log(
        `  ${label}格式校验未通过（第 ${attempt} 次）: ${validation.reason}`,
      );
      console.log("  正在重新生成...\n");
      messages.push({
        role: "user",
        content: `生成的提交信息格式不符合规范：${validation.reason}。请严格按照 Conventional Commits 格式重新生成。`,
      });
      lastMessage = null;
    } else {
      throw new Error(
        `${label}格式校验失败（已重试 ${MAX_RETRIES} 次）: ${validation.reason}\n最后一次生成的提交信息：\n${lastMessage}`,
      );
    }
  }

  throw new Error("意外的错误：重试循环结束后仍未能生成有效提交信息");
}

export async function generateCommitMessage(
  diff: string,
  config: AppConfig,
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `以下是 Git diff 内容：\n\n${diff}` },
  ];
  return retryWithValidation(config, messages);
}
