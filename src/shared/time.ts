/**
 * 公共层 —— 时间格式化。
 *
 * 原先 formatElapsed 在 utils/format-time.ts、日志器内部又自带一份 formatTime，
 * 两份重复胶水（I06 的 P8）。这里合并为同一模块对外提供两个语义清晰的函数。
 */

/** 将毫秒数格式化为人类可读的中文时间字符串。 */
export function formatElapsed(ms: number): string {
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(2)} 分钟`;
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(2)} 秒`;
  }
  return `${Math.round(ms)} 毫秒`;
}

/** 格式化当前时钟时间为 HH:MM:SS.mmm，供日志前缀使用。 */
export function formatClockTime(date: Date = new Date()): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}`
  );
}
