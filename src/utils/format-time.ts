/**
 * 将毫秒数格式化为人类可读的中文时间字符串
 */
export function formatElapsed(ms: number): string {
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(2)} 分钟`;
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(2)} 秒`;
  }
  return `${Math.round(ms)} 毫秒`;
}
