/**
 * 公共层 —— 文本宽度工具。
 *
 * JS 的 String.length 计的是 UTF-16 码元，中文/全角字符也只算 1，
 * 与 git log --oneline 的显示宽度不符（I04 P3）。这里按东亚宽度惯例：
 * CJK 与全角标点计 2，其余计 1，供提交消息行宽校验与截断共用。
 */

const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/**
 * 计算字符串的半角显示宽度。
 * @param text - 待计量的文本。
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += WIDE_CHAR.test(char) ? 2 : 1;
  }
  return width;
}

/**
 * 按显示宽度截断字符串，返回不超过 maxWidth 的前缀。
 * @param text - 待截断的文本。
 * @param maxWidth - 半角字符宽度上限。
 */
export function truncateToWidth(text: string, maxWidth: number): string {
  let width = 0;
  let end = 0;
  for (const char of text) {
    const charWidth = WIDE_CHAR.test(char) ? 2 : 1;
    if (width + charWidth > maxWidth) break;
    width += charWidth;
    end += char.length;
  }
  return text.slice(0, end);
}
