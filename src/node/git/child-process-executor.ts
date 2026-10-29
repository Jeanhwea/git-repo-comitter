/**
 * git 执行器 —— Node 默认实现（child_process，F07）。
 *
 * 原 runner.ts 的 execFileSync 原语原样搬入本文件；全局参数、缓冲上限与
 * 失败处理策略保持不变。由 Node 入口（lib.ts）在加载时通过 setGitExecutor 装配。
 *
 * 本文件是 Node 专有：浏览器 / WebView 入口不导入本模块（其 import 图不得出现
 * child_process），改由调用方注入 Tauri shell IPC 等实现。
 */
import { execFileSync } from "child_process";

import type { GitExecutor } from "@/infra/git/executor";

const GIT_MAX_BUFFER = 1024 * 1024 * 1024;

const GIT_GLOBAL_ARGS = ["-c", "core.quotepath=false"];

/** Node 默认 git 执行器：基于 child_process.execFileSync。 */
export const childProcessExecutor: GitExecutor = {
  exec(args, options = {}) {
    try {
      return execFileSync("git", [...GIT_GLOBAL_ARGS, ...args], {
        cwd: options.cwd ?? process.cwd(),
        encoding: "utf-8",
        maxBuffer: GIT_MAX_BUFFER,
      });
    } catch (err) {
      if (options.allowFailure) return "";
      throw err;
    }
  },
};
