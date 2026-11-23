/**
 * git 执行器 —— Node 默认实现（child_process，F07）。
 *
 * 由 Node 入口（cli.ts / lib.ts）经 \@/node/setup 的 setupNodeGitExecutor
 * 在加载时通过 setGitExecutor 装配。
 *
 * 本文件是 Node 专有：浏览器 / WebView 入口不导入本模块（其 import 图不得出现
 * child_process），改由调用方注入 Tauri shell IPC 等实现。
 */
import { execFileSync } from "child_process";

import type { GitExecutor } from "@/infra/git/executor";
import { GrcError } from "@/shared/errors";

const GIT_MAX_BUFFER = 1024 * 1024 * 1024;

const GIT_GLOBAL_ARGS = ["-c", "core.quotepath=false"];

const STDERR_MAX_LENGTH = 500;

/**
 * 从 execFileSync 抛出的错误里取出 stderr 文本。
 * @param err - 子进程错误对象。
 */
function stderrOf(err: unknown): string {
  if (!err || typeof err !== "object" || !("stderr" in err)) return "";
  const stderr = (err as { stderr?: unknown }).stderr;
  return stderr == null ? "" : String(stderr);
}

/**
 * 判定失败是否由 Git Hook 拦截（F09 的 HOOK_BLOCKED）。
 * @param stderr - git 命令的标准错误输出。
 */
function isHookFailure(stderr: string): boolean {
  return /hook was denied|pre-commit hook|commit-msg hook|hook failed|hook script failed/i.test(
    stderr,
  );
}

/** Node 默认 git 执行器：基于 child_process.execFileSync，失败统一包装为 GrcError。 */
export const childProcessExecutor: GitExecutor = {
  exec(args, options = {}) {
    try {
      return execFileSync("git", [...GIT_GLOBAL_ARGS, ...args], {
        cwd: options.cwd ?? process.cwd(),
        encoding: "utf-8",
        maxBuffer: GIT_MAX_BUFFER,
      });
    } catch (err) {
      // 探测式调用仍需把「命令失败」与「无结果」区分开：调用方改用 tryExecGit。
      if (options.allowFailure) return "";
      const stderr = stderrOf(err).trim();
      const detail =
        stderr.slice(0, STDERR_MAX_LENGTH) ||
        (err instanceof Error ? err.message : String(err));
      throw new GrcError(
        `git ${args[0] ?? "命令"} 执行失败：${detail}`,
        isHookFailure(stderr) ? "HOOK_BLOCKED" : "GIT_FAILED",
      );
    }
  },
};
