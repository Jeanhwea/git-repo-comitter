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
// —— 与 Node 入口共享的公共契约（单一来源，见 src/api/public.ts）——
export {
  generateCommitMessage,
  generateCommitMessageBatched,
  getProgressSink,
  GrcError,
  loadDefaultConfig,
  resolveConfig,
  setLogLevel,
  setLogSink,
  setProgressSink,
  validateCommitMessage,
  type AppConfig,
  type BatchResult,
  type GrcErrorCode,
  type LLMConfig,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type ProgressSink,
  type UserConfig,
  type ValidationResult,
} from "@/api/public";
