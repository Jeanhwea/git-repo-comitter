/**
 * LLM 基础设施 —— token 预算。
 *
 * 预算计算取决于模型上下文容量与提示词开销，属基础设施职责；
 * 领域编排只消费 effectiveLimit 的结果，不自行估算 token。
 */
import type { AppConfig } from "@/config/types";
import { estimateTokens } from "@/shared/tokens";

/** 消息包裹、角色标记等结构性开销的保守估计。 */
const FRAMING_OVERHEAD = 200;

/** 预留的安全余量比例，抵消 token 估算误差（W6 提高到 15%）。 */
const SAFETY_MARGIN_RATIO = 0.15;

/** 尾部最多额外保留的草稿数，避免整段尾部上下文丢失。 */
const MAX_TAIL_DRAFTS = 2;

/**
 * 计算在给定系统提示词下，单次请求可用于正文内容的 token 上限。
 * @param config - 完整配置，取其上下文容量与输出额度参与计算。
 * @param systemPrompt - 本次请求的系统提示词，先从额度中扣除。
 */
export function effectiveLimit(
  config: AppConfig,
  systemPrompt: string,
): number {
  // 上下文容量扣掉系统提示词、结构性开销与预留给输出的额度。
  const grossBudget =
    config.llm.maxInputTokens -
    estimateTokens(systemPrompt) -
    FRAMING_OVERHEAD -
    config.llm.maxOutputTokens;
  return Math.floor(grossBudget * (1 - SAFETY_MARGIN_RATIO));
}

/** 按预算裁剪后的草稿集合：头部与尾部保留，中间省略。 */
export interface FittedDrafts {
  head: string[];
  tail: string[];
  omitted: number;
}

/**
 * 按 token 预算挑选草稿：先从头保留，再从尾部补留少量片段，
 * 避免旧实现「只留前部、尾部整段丢失」的问题（S02 与实现口径统一）。
 * @param parts - 草稿片段，按批次顺序排列。
 * @param limit - 累计 token 上限。
 */
export function fitDraftsWithinBudget(
  parts: string[],
  limit: number,
): FittedDrafts {
  let total = 0;
  let headEnd = 0;
  while (headEnd < parts.length) {
    const cost = estimateTokens(parts[headEnd] ?? "");
    if (total + cost > limit) break;
    total += cost;
    headEnd++;
  }

  let tailStart = parts.length;
  while (tailStart > headEnd && parts.length - tailStart < MAX_TAIL_DRAFTS) {
    const cost = estimateTokens(parts[tailStart - 1] ?? "");
    if (total + cost > limit) break;
    total += cost;
    tailStart--;
  }

  const head = parts.slice(0, headEnd);
  const tail = parts.slice(tailStart);
  return {
    head,
    tail,
    omitted: parts.length - head.length - tail.length,
  };
}
