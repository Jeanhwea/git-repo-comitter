import type { ChatCompletionRequestMessageRoleEnum } from "openai/api";

import type { AppConfig } from "../config/types";
import { validateCommitMessage } from "./checker";
import {
  MAX_RETRIES,
  SYSTEM_PROMPT,
  createClient,
  generateCommitMessage,
} from "./client";
import { extractContent } from "./response";
import { groupIntoBatches, parseDiffBlocks } from "./split";
import { estimateTokens } from "./tokens";

const FRAMING_OVERHEAD = 200;

const PARTIAL_SYSTEM_PROMPT = `你是一位擅长编写 Git 提交信息的专家。你将收到一个大型 Git diff 的**一部分**（包含部分文件的变更）。

请仅根据这部分 diff 生成一个**局部的**提交信息草稿，格式规范同 Conventional Commits，但允许 scope 或 type 不够精确——后续会合并所有部分的结果。

格式规范：
- 遵循 Conventional Commits：<type>(<scope>): <description>
- type 可选值：feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- 标题行控制在 72 字符以内
- 正文使用无序列表分条陈述，每条以 "- " 开头
- 描述语言使用中文，避免使用英文
- 只回复提交信息本身，不要添加任何解释`;

const MERGE_SYSTEM_PROMPT = `你是一位擅长编写 Git 提交信息的专家。你将收到多个**局部的**提交信息草稿，每个草稿描述了部分文件的变更。

请将它们合并为一个**完整的、连贯的**提交信息，遵循 Conventional Commits 格式：
- 选择最能概括所有变更的 type 和 scope
- 标题行控制在 72 字符以内
- 正文合并所有草稿的要点，去重，保持逻辑分组，使用无序列表
- 如变更较简单，可省略正文
- 描述语言使用中文，避免使用英文
- 只回复最终的提交信息本身，不要添加任何解释`;

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
  const response = await client.createChatCompletion({
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
  const content = extractContent(response.data);
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

  const response = await client.createChatCompletion({
    model: config.llm.model,
    temperature: config.llm.temperature,
    max_tokens: config.llm.maxOutputTokens,
    messages: [
      { role: "system", content: MERGE_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });
  const content = extractContent(response.data);
  if (!content) {
    throw new Error("LLM 在合并提交信息时返回了空内容。");
  }
  return content;
}

async function validateWithRetry(
  initialMessage: string,
  partialMessages: string[],
  config: AppConfig,
): Promise<string> {
  const messages: Array<{
    role: ChatCompletionRequestMessageRoleEnum;
    content: string;
  }> = [
    {
      role: "system" as ChatCompletionRequestMessageRoleEnum,
      content: MERGE_SYSTEM_PROMPT,
    },
    {
      role: "user" as ChatCompletionRequestMessageRoleEnum,
      content: partialMessages
        .map((msg, i) => `--- 部分 ${i + 1} ---\n${msg}`)
        .join("\n\n"),
    },
    { role: "assistant", content: initialMessage },
  ];

  let lastMessage = initialMessage;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const validation = await validateCommitMessage(lastMessage);
    if (validation.valid) return lastMessage;

    if (attempt < MAX_RETRIES) {
      console.log(
        `  合并信息格式校验未通过（第 ${attempt} 次）: ${validation.reason}`,
      );
      console.log("  正在重新合并...\n");
      messages.push({
        role: "user",
        content: `生成的提交信息格式不符合规范：${validation.reason}。请严格按照 Conventional Commits 格式重新生成。`,
      });

      const client = createClient(config);
      const response = await client.createChatCompletion({
        model: config.llm.model,
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxOutputTokens,
        messages,
      });
      lastMessage = extractContent(response.data);
      if (!lastMessage) {
        throw new Error("LLM 在重试合并时返回了空内容。");
      }
      messages.push({ role: "assistant", content: lastMessage });
    } else {
      throw new Error(
        `合并信息格式校验失败（已重试 ${MAX_RETRIES} 次）: ${validation.reason}\n最后一次生成的提交信息：\n${lastMessage}`,
      );
    }
  }

  throw new Error("意外的错误：重试循环结束后仍未能生成有效提交信息");
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

  const message = await validateWithRetry(merged, partialMessages, config);
  return { message, batchCount: batches.length };
}
