/**
 * 公共层 —— token 估算（W6）。
 *
 * 原先按 2 字符/token 统一折算：英文高估尚可接受，中文则严重低估
 * （中文实际约 1~1.5 字/token），导致中文 diff 的分批边界偏大。
 * 这里改为中英文分治 + 更保守的中文系数，不引入 tokenizer 依赖（Q6 裁决）。
 */
import { displayWidth } from "./text";

/** 中文按每 token 1.5 个全角字估算，留出安全余量。 */
const WIDE_CHARS_PER_TOKEN = 1.5;
/** 英文与符号按每 token 4 个半角字符估算。 */
const ASCII_CHARS_PER_TOKEN = 4;

/**
 * 粗略估算文本的 token 数：全角字符与半角字符分别折算后相加。
 * 仅用于「会不会超出上下文预算」这种量级判断，不追求精确。
 * @param text - 待估算文本。
 */
export function estimateTokens(text: string): number {
  let wideWidth = 0;
  let asciiWidth = 0;
  for (const char of text) {
    if (displayWidth(char) === 2) wideWidth += 1;
    else asciiWidth += 1;
  }
  return (
    Math.ceil(wideWidth / WIDE_CHARS_PER_TOKEN) +
    Math.ceil(asciiWidth / ASCII_CHARS_PER_TOKEN)
  );
}
