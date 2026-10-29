/**
 * Node 环境装配 —— 注册默认 git 执行器（F07）。
 *
 * CLI 入口（cli.ts）与库入口（lib.ts）都是 Node 环境，都需要在加载时把基于
 * child_process 的默认执行器注册进 GitExecutor 端口；浏览器 / WebView 入口
 * 不调用本函数，改由调用方通过 setGitExecutor 注入 Tauri IPC 等实现。
 */
import { setGitExecutor } from "@/infra/git/executor";
import { childProcessExecutor } from "@/node/git/child-process-executor";

/** 注册 Node 默认 git 执行器（基于 child_process）。 */
export function setupNodeGitExecutor(): void {
  setGitExecutor(childProcessExecutor);
}
