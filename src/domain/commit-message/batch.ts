/**
 * 领域层 —— 分批生成流水线编排。
 *
 * 职责只有编排：判断是否超预算、切块折叠、逐批生成、合并草稿。
 * token 预算计算已下沉到 infra/llm/budget（I06 的 P5），
 * 消息组装统一走 prompts.buildMessages，不再自行拼 system/user。
 */
import type { AppConfig } from "@/config/types";
import {
  collapseLargeBlocks,
  groupIntoBatches,
  parseDiffBlocks,
} from "@/infra/git/diff";
import { effectiveLimit, fitWithinBudget } from "@/infra/llm/budget";
import { callWithValidation } from "@/infra/llm/retry";
import { chatCompletion } from "@/infra/llm/transport/client";
import {
  buildMessages,
  commitMessagePrompt,
  commitMessageRepairHint,
  mergeCommitPrompt,
  partialCommitPrompt,
  wrapDraft,
  wrapPartialDiff,
} from "@/prompts";
import { createLogger } from "@/shared/logger";
import { formatElapsed } from "@/shared/time";
import { estimateTokens } from "@/shared/tokens";

import { validateCommitMessage } from "./checker";
import { generateCommitMessage } from "./generator";

const log = createLogger("batch");

export interface BatchResult {
  message: string;
  batchCount: number;
}

async function generatePartialMessage(
  diffContent: string,
  config: AppConfig,
): Promise<string> {
  const messages = buildMessages(partialCommitPrompt, diffContent);
  log.trace(
    `分批生成提交信息，输入约 ${estimateTokens(wrapPartialDiff(diffContent))} tokens`,
  );
  const t0 = performance.now();
  const content = await chatCompletion(config, messages);
  if (!content) {
    throw new Error("LLM 在处理分批 diff 时返回了空内容。");
  }
  log.trace(
    `分批生成完成，输出 ${content.length} 字符（耗时 ${formatElapsed(performance.now() - t0)}）`,
  );
  return content;
}

export async function generateCommitMessageBatched(
  diff: string,
  config: AppConfig,
): Promise<BatchResult> {
  const limit = effectiveLimit(config, commitMessagePrompt.system);
  const diffTokens = estimateTokens(diff);
  log.debug(`开始生成：diff 约 ${diffTokens} tokens，单批上限 ${limit} tokens`);

  if (diffTokens <= limit) {
    log.debug("diff 未超出单批上限，直接生成");
    const message = await generateCommitMessage(diff, config);
    return { message, batchCount: 1 };
  }

  const blocks = collapseLargeBlocks(parseDiffBlocks(diff), limit);
  const collapsedDiff = blocks.map((b) => b.content).join("\n");
  const collapsedTokens = estimateTokens(collapsedDiff);
  if (collapsedTokens <= limit) {
    log.debug(`合并大块后约 ${collapsedTokens} tokens，单批可容纳`);
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
  const { kept, omitted } = fitWithinBudget(
    partialMessages.map((draft, i) => wrapDraft(i + 1, draft)),
    effectiveLimit(config, mergeCommitPrompt.system),
  );

  if (kept.length === 0) {
    throw new Error(
      `合并信息的内存不足：LLM 上下文容量 (${config.llm.maxInputTokens} tokens) 不足以容纳任何一条草稿，` +
        `请增大 maxInputTokens 或选择更大上下文的模型。`,
    );
  }

  const messages = buildMessages(mergeCommitPrompt, { parts: kept, omitted });
  const message = await callWithValidation(config, messages, {
    label: "合并信息",
    validate: validateCommitMessage,
    repairHint: commitMessageRepairHint,
  });
  return { message, batchCount: batches.length };
}
