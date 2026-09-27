/**
 * LLM 基础设施 —— token 预算。
 *
 * 原先内联在 domain/commit-message/batch.ts（I06 的 P5）。
 * 预算计算取决于模型上下文容量与提示词开销，属基础设施职责；
 * 归入本模块后，领域编排只消费 effectiveLimit 的结果。
 */
import type { AppConfig } from "@/config/types";
import { estimateTokens } from "@/shared/tokens";

/** 消息包裹、角色标记等结构性开销的保守估计。 */
const FRAMING_OVERHEAD = 200;

/** 预留的安全余量比例，抵消 token 估算误差。 */
const SAFETY_MARGIN_RATIO = 0.05;

/** 计算在给定系统提示词下，单次请求可用于正文内容的 token 上限。 */
export function effectiveLimit(
  config: AppConfig,
  systemPrompt: string,
): number {
  const raw =
    config.llm.maxInputTokens -
    estimateTokens(systemPrompt) -
    FRAMING_OVERHEAD -
    config.llm.maxOutputTokens;
  return Math.floor(raw * (1 - SAFETY_MARGIN_RATIO));
}
