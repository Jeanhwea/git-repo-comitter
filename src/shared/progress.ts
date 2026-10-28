/**
 * 公共层 —— 用户可见进度输出槽。
 *
 * F05：抽库前，面向用户的进度文案（「正在处理第 N 批…」「校验未通过，重新生成…」）
 * 由领域层与基础设施层直接 console.log 打印。库被其他代码调用时这类输出无法关闭、
 * 也无法重定向，属于必须解耦的 CLI 关注点（F05 差距 3）。
 *
 * 约定：
 * - 领域层 / 基础设施层只调用 emitProgress，不直接碰 console；
 * - 默认无输出槽（静默），库调用方不设置即完全安静；
 * - CLI 在启动时装配 console.log 作为输出槽，行为与改造前一致。
 */
export type ProgressSink = (message: string) => void;

let currentSink: ProgressSink | null = null;

/**
 * 装配全局输出槽，返回上一个（便于临时替换后还原）。
 * 传 null 表示恢复静默。
 */
export function setProgressSink(sink: ProgressSink | null): ProgressSink | null {
  const previous = currentSink;
  currentSink = sink;
  return previous;
}

export function getProgressSink(): ProgressSink | null {
  return currentSink;
}

/** 输出一条用户可见进度；未装配输出槽时为空操作。 */
export function emitProgress(message: string): void {
  if (!currentSink) return;
  currentSink(message);
}
