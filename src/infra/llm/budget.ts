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

/** 预留的安全余量比例，抵消 token 估算误差。 */
const SAFETY_MARGIN_RATIO = 0.05;

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

/**
 * 按 token 预算从头挑选片段：返回可容纳的片段与被丢弃的数量。
 * 顺序敏感（草稿按批次排列），一旦某片段放不下即停止，保证不出现中间空洞。
 * @param parts - 待挑选的片段，按给定顺序参与挑选。
 * @param limit - 累计 token 上限，超出即停止。
 */
export function fitWithinBudget(
  parts: string[],
  limit: number,
): { kept: string[]; omitted: number } {
  let total = 0;
  for (const [i, part] of parts.entries()) {
    const cost = estimateTokens(part);
    if (total + cost > limit) {
      return { kept: parts.slice(0, i), omitted: parts.length - i };
    }
    total += cost;
  }
  return { kept: parts, omitted: 0 };
}
