/**
 * 库入口 —— 稳定公共 API（F05）。
 *
 * 约定：只有本文件导出的符号属于对外承诺的契约，
 * 其余模块的实现细节可能随版本调整，调用方请勿从深层路径导入。
 *
 * 与 CLI 的关系：`grc` 命令是这套 API 的参考消费者（见 src/app/commands/commit.ts），
 * 两者共用 domain/commit-flow 的编排，因此 CLI 与库不会出现两套行为。
 *
 * 设计要点：
 * - 不读写 ~/.grc，配置由调用方显式传入（resolveConfig / loadDefaultConfig 组装）；
 * - 不打印、不提问，进度走 setProgressSink / onProgress，未装配即静默；
 * - 不调用 process.exit，失败抛 GrcError，调用方按 code 分支处理。
 */

import { validateCommitMessage as validateMessage } from "@/domain/commit-message/checker";
import { setGitExecutor } from "@/infra/git/executor";
import { childProcessExecutor } from "@/node/git/child-process-executor";

// Node 入口：自动装配基于 child_process 的默认 git 执行器（F07）。
// 浏览器 / WebView 入口不装配，由调用方通过 setGitExecutor 注入实现。
setGitExecutor(childProcessExecutor);

// —— 配置 ——
export { loadDefaultConfig, resolveConfig } from "@/config/loader";
export { loadUserConfigFile } from "@/config/user-file";
export type { AppConfig, LLMConfig, UserConfig } from "@/config/types";

// —— 提交流程 ——
export {
  executeCommit as commit,
  type CommitOutcome,
  type CommitRequest,
  type CommitSkipped,
  type CommitSuccess,
} from "@/domain/commit-flow";

// —— 提交信息生成与校验 ——
export {
  generateCommitMessageBatched,
  type BatchResult,
} from "@/domain/commit-message/batch";
export { generateCommitMessage } from "@/domain/commit-message/generator";

// —— git 基础设施 ——
export { getStagedDiff } from "@/infra/git/diff";
export { gitCommit } from "@/infra/git/repo";

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
