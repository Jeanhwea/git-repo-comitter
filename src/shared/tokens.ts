/**
 * 公共层 —— token 估算。
 *
 * 原先位于 infra/llm/tokens.ts，导致 git 模块为了分块而横向依赖 llm 模块（I06 的 P5）。
 * 估算本身是与 LLM 无关的纯启发式文本能力，归入 shared 后 git 与 llm 各自正向依赖它。
 */
const CHARS_PER_TOKEN = 2;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
