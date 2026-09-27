import OpenAI from "openai";

import type { AppConfig } from "@/infra/config/types";
import { callWithValidation } from "@/infra/llm/retry";
import { estimateTokens } from "@/infra/llm/tokens";
import { singleTurn } from "@/infra/llm/transport/client";
import { formatElapsed } from "@/utils/format-time";
import { createLogger } from "@/utils/logger";

import { commitMessageRepairHint, validateCommitMessage } from "./checker";
import { generateCommitMessage } from "./generator";
import {
  MERGE_SYSTEM_PROMPT,
  PARTIAL_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  wrapDraft,
  wrapDrafts,
  wrapOmissionNotice,
  wrapPartialDiff,
} from "./prompts";
import {
  collapseLargeBlocks,
  groupIntoBatches,
  parseDiffBlocks,
} from "./split";

const log = createLogger("batch");

const FRAMING_OVERHEAD = 200;
const SAFETY_MARGIN_RATIO = 0.05;

export interface BatchResult {
  message: string;
  batchCount: number;
}

function effectiveLimit(config: AppConfig, systemPrompt: string): number {
  const raw =
    config.llm.maxInputTokens -
    estimateTokens(systemPrompt) -
    FRAMING_OVERHEAD -
    config.llm.maxOutputTokens;
  return Math.floor(raw * (1 - SAFETY_MARGIN_RATIO));
}

async function generatePartialMessage(
  diffContent: string,
  config: AppConfig,
): Promise<string> {
  const userContent = wrapPartialDiff(diffContent);
  log.trace(`分批生成提交信息，输入约 ${estimateTokens(userContent)} tokens`);
  const t0 = performance.now();
  const content = await singleTurn(config, PARTIAL_SYSTEM_PROMPT, userContent);
  if (!content) {
    throw new Error("LLM 在处理分批 diff 时返回了空内容。");
  }
  log.trace(
    `分批生成完成，输出 ${content.length} 字符（耗时 ${formatElapsed(performance.now() - t0)}）`,
  );
  return content;
}

function buildMergeMessages(
  partialMessages: string[],
  config: AppConfig,
): OpenAI.ChatCompletionMessageParam[] {
  const limit = effectiveLimit(config, MERGE_SYSTEM_PROMPT);
  const parts: string[] = [];
  let totalTokens = 0;
  let omitted = 0;

  for (let i = 0; i < partialMessages.length; i++) {
    const part = wrapDraft(i + 1, partialMessages[i]);
    const partTokens = estimateTokens(part);
    if (totalTokens + partTokens > limit) {
      omitted = partialMessages.length - i;
      break;
    }
    parts.push(part);
    totalTokens += partTokens;
  }

  if (parts.length === 0) {
    throw new Error(
      `合并信息的内存不足：LLM 上下文容量 (${config.llm.maxInputTokens} tokens) 不足以容纳任何一条草稿，` +
        `请增大 maxInputTokens 或选择更大上下文的模型。`,
    );
  }

  const userContent =
    wrapDrafts(parts) +
    (omitted > 0 ? `\n\n${wrapOmissionNotice(omitted)}` : "");

  return [
    { role: "system", content: MERGE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

export async function generateCommitMessageBatched(
  diff: string,
  config: AppConfig,
): Promise<BatchResult> {
  const limit = effectiveLimit(config, SYSTEM_PROMPT);
  const diffTokens = estimateTokens(diff);
  log.debug(`开始生成：diff 约 ${diffTokens} tokens，单批上限 ${limit} tokens`);

  if (diffTokens <= limit) {
    log.debug("diff 未超出单批上限，直接生成");
    const message = await generateCommitMessage(diff, config);
    return { message, batchCount: 1 };
  }

  const blocks = collapseLargeBlocks(parseDiffBlocks(diff), limit);
  const collapsedDiff = blocks.map((b) => b.content).join("\n");
  if (estimateTokens(collapsedDiff) <= limit) {
    log.debug(
      `合并大块后约 ${estimateTokens(collapsedDiff)} tokens，单批可容纳`,
    );
    const message = await generateCommitMessage(collapsedDiff, config);
    return { message, batchCount: 1 };
  }

  const batches = groupIntoBatches(blocks, limit);
  log.debug(`拆分为 ${batches.length} 个批次（按 token 上限切分）`);

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
  const messages = buildMergeMessages(partialMessages, config);
  const message = await callWithValidation(config, messages, {
    label: "合并信息",
    validate: validateCommitMessage,
    repairHint: commitMessageRepairHint,
  });
  return { message, batchCount: batches.length };
}
