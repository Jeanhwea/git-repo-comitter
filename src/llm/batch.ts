import OpenAI from "openai";

import type { AppConfig } from "../config/types";
import {
  createClient,
  generateCommitMessage,
  retryWithValidation,
} from "./client";
import {
  MERGE_SYSTEM_PROMPT,
  PARTIAL_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from "./prompts";
import { extractContent } from "./response";
import { groupIntoBatches, parseDiffBlocks } from "./split";
import { estimateTokens } from "./tokens";

const FRAMING_OVERHEAD = 200;

export interface BatchResult {
  message: string;
  batchCount: number;
}

function effectiveLimit(config: AppConfig, systemPrompt: string): number {
  return (
    config.llm.maxInputTokens -
    estimateTokens(systemPrompt) -
    FRAMING_OVERHEAD -
    config.llm.maxOutputTokens
  );
}

async function generatePartialMessage(
  diffContent: string,
  config: AppConfig,
): Promise<string> {
  const client = createClient(config);
  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: config.llm.temperature,
    max_tokens: config.llm.maxOutputTokens,
    messages: [
      { role: "system", content: PARTIAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是 Git diff 的一部分：\n\n${diffContent}`,
      },
    ],
  });
  const content = extractContent(response);
  if (!content) {
    throw new Error("LLM 在处理分批 diff 时返回了空内容。");
  }
  return content;
}

async function mergePartialMessages(
  partialMessages: string[],
  config: AppConfig,
): Promise<string> {
  const client = createClient(config);
  const limit = effectiveLimit(config, MERGE_SYSTEM_PROMPT);

  const parts: string[] = [];
  let totalTokens = 0;
  let omitted = 0;

  for (let i = 0; i < partialMessages.length; i++) {
    const part = `--- 部分 ${i + 1} ---\n${partialMessages[i]}`;
    const partTokens = estimateTokens(part);
    if (totalTokens + partTokens <= limit) {
      parts.push(part);
      totalTokens += partTokens;
    } else {
      omitted = partialMessages.length - i;
      break;
    }
  }

  const userContent =
    parts.join("\n\n") +
    (omitted > 0 ? `\n\n[... 前面 ${omitted} 个批次已省略 ...]` : "");

  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: config.llm.temperature,
    max_tokens: config.llm.maxOutputTokens,
    messages: [
      { role: "system", content: MERGE_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });
  const content = extractContent(response);
  if (!content) {
    throw new Error("LLM 在合并提交信息时返回了空内容。");
  }
  return content;
}

export async function generateCommitMessageBatched(
  diff: string,
  config: AppConfig,
): Promise<BatchResult> {
  const limit = effectiveLimit(config, SYSTEM_PROMPT);
  const diffTokens = estimateTokens(diff);

  if (diffTokens <= limit) {
    const message = await generateCommitMessage(diff, config);
    return { message, batchCount: 1 };
  }

  const blocks = parseDiffBlocks(diff);
  const batches = groupIntoBatches(blocks, limit);

  console.log(
    `  变更内容较大（约 ${diffTokens} tokens），将分为 ${batches.length} 批次处理...`,
  );

  const partialMessages: string[] = [];
  for (let i = 0; i < batches.length; i++) {
    console.log(`  正在处理第 ${i + 1}/${batches.length} 批次...`);
    const partial = await generatePartialMessage(batches[i].content, config);
    partialMessages.push(partial);
  }

  console.log(`  正在合并 ${batches.length} 个批次的提交信息...`);
  const merged = await mergePartialMessages(partialMessages, config);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: MERGE_SYSTEM_PROMPT },
    {
      role: "user",
      content: partialMessages
        .map((msg, i) => `--- 部分 ${i + 1} ---\n${msg}`)
        .join("\n\n"),
    },
  ];
  const message = await retryWithValidation(config, messages, {
    initialMessage: merged,
    label: "合并信息",
  });
  return { message, batchCount: batches.length };
}
