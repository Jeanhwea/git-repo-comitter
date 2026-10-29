/**
 * 库入口 —— 浏览器端公共 API（F07）。
 *
 * 与 src/lib.ts 同源，但只导出纯函数侧 API：生成 + 校验 + 配置 + 横切，
 * 不暴露任何依赖 Node 内置模块的 git 读写能力（getStagedDiff / gitCommit）。
 *
 * 约束：本文件的 import 图不允许出现任何 Node 内置模块（fs / os / path / child_process）。
 * 纯核（prompts、校验、生成、分批、预算、重试）已就绪且零污染，
 * diff 由调用方（Rust / Node 侧）算好后以字符串传入（见 F07 目标场景）。
 *
 * 消费方通过子路径导入：从 "git-repo-comitter/browser" 取所需符号。
 */
import { validateCommitMessage as validateMessage } from "@/domain/commit-message/checker";

// —— 配置 ——
export { loadDefaultConfig, resolveConfig } from "@/config/loader";
export type { AppConfig, LLMConfig, UserConfig } from "@/config/types";

// —— 提交信息生成与校验 ——
export { generateCommitMessage } from "@/domain/commit-message/generator";
export {
  generateCommitMessageBatched,
  type BatchResult,
} from "@/domain/commit-message/batch";

// —— 错误、日志与进度 ——
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

/**
 * 提交信息校验结论：成功时携带校验后的消息，失败时携带命中的规则原因。
 *
 * 与内部的 ValidationOutcome 同构，单独在此声明是为了让公共 API 不依赖内部模块，
 * 也避免把 LLM 相关类型卷进对外声明文件（F05：公共 API 契约保持精简）。
 */
export type ValidationResult =
  | { valid: true; value: string; warnings?: string[] }
  | { valid: false; reason?: string };

/**
 * 按 Conventional Commits 约束校验一条提交信息（规则见 docs/feat/F04）。
 * @param content - 待校验的提交信息原文。
 */
export function validateCommitMessage(content: string): ValidationResult {
  return validateMessage(content);
}
