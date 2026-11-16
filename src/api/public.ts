/**
 * 入口适配层 —— 两个入口（Node / 浏览器）共享的公共契约（W5）。
 *
 * 原先 lib.ts 与 lib-browser.ts 各写一份 ValidationResult 与
 * validateCommitMessage wrapper，新增公共符号必须改两处。这里统一定义，
 * 两个入口只做 re-export；本模块不得导入任何 Node 专有实现，
 * 否则浏览器入口的零 Node 依赖约束会被打破。
 */
import { validateCommitMessage as validateMessage } from "@/domain/commit-message/checker";
import type { ValidationOutcome } from "@/shared/validation";

export { loadDefaultConfig, resolveConfig } from "@/config/loader";
export type { AppConfig, LLMConfig, UserConfig } from "@/config/types";
export { generateCommitMessage } from "@/domain/commit-message/generator";
export {
  generateCommitMessageBatched,
  type BatchResult,
} from "@/domain/commit-message/batch";
export { GrcError, type GrcErrorCode } from "@/shared/errors";
export {
  setLogLevel,
  setLogSink,
  type LogLevel,
  type LogRecord,
  type LogSink,
} from "@/shared/logger";
export {
  getProgressSink,
  setProgressSink,
  type ProgressSink,
} from "@/shared/progress";

/** 提交信息校验结论（公共契约，内部同构于 ValidationOutcome<string>）。 */
export type ValidationResult = ValidationOutcome<string>;

/**
 * 按 Conventional Commits 约束校验一条提交信息（规则见 docs/feat/F04）。
 * @param content - 待校验的提交信息原文。
 */
export function validateCommitMessage(content: string): ValidationResult {
  return validateMessage(content);
}
