/**
 * git 基础设施 —— 仓库操作层。
 *
 * 由 runner.ts 中拆出：面向仓库的具体动作（判断仓库、暂存、提交、取消暂存），
 * 全部基于 execGit 原语实现。
 */
import { execGit } from "./runner";

export function isGitRepo(): boolean {
  return (
    execGit(["rev-parse", "--is-inside-work-tree"], {
      tolerateError: true,
    }).trim() === "true"
  );
}

export function gitAddAll(): void {
  execGit(["add", "."]);
}

export function gitCommit(message: string): void {
  execGit(["commit", "-m", message]);
}

export function gitReset(files: string[]): void {
  if (files.length === 0) return;
  execGit(["reset", "--", ...files]);
}
