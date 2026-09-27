/**
 * git 基础设施 —— 命令原语层。
 *
 * 只负责「如何调用 git 进程」：全局参数、工作目录、缓冲上限与失败处理策略。
 * 具体仓库操作（isGitRepo / gitAddAll / gitCommit）已拆到 repo.ts，
 * 使「调用机制」与「业务动作」各自单一职责（I06 的 P5）。
 */
import { execFileSync } from "child_process";

export interface GitExecOptions {
  /** 命令失败时返回空串而不抛出（用于「有没有」这类探测式调用）。 */
  allowFailure?: boolean;
}

const GIT_MAX_BUFFER = 1024 * 1024 * 1024;

const GIT_GLOBAL_ARGS = ["-c", "core.quotepath=false"];

export function execGit(args: string[], options: GitExecOptions = {}): string {
  try {
    return execFileSync("git", [...GIT_GLOBAL_ARGS, ...args], {
      cwd: process.cwd(),
      encoding: "utf-8",
      maxBuffer: GIT_MAX_BUFFER,
    });
  } catch (err) {
    if (options.allowFailure) return "";
    throw err;
  }
}
