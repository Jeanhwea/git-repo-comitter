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

import { setupNodeGitExecutor } from "@/node/setup";

// Node 入口：自动装配基于 child_process 的默认 git 执行器（F07）。
// 浏览器 / WebView 入口不装配，由调用方通过 setGitExecutor 注入实现。
setupNodeGitExecutor();

// —— 两入口共享的公共契约（单一来源，见 src/api/public.ts）——
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

// —— Node 专有配置读写 ——
export { loadUserConfigFile } from "@/config/user-file";

// —— 提交流程 ——
export {
  executeCommit as commit,
  type CommitOutcome,
  type CommitRequest,
  type CommitSkipped,
  type CommitSuccess,
} from "@/domain/commit-flow";

// —— git 基础设施（仅 Node 入口）——
export { getStagedDiff } from "@/infra/git/diff";
export { gitCommit } from "@/infra/git/repo";
