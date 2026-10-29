/**
 * git 基础设施 —— 仓库操作层。
 *
 * 由 runner.ts 中拆出：面向仓库的具体动作（判断仓库、暂存、提交、取消暂存），
 * 全部基于 execGit 原语实现。
 *
 * F05：所有动作新增可选 cwd，使库调用方能指定目标仓库而不依赖 process.cwd()。
 */
import { execGit } from "./runner";

export function isGitRepo(cwd?: string): boolean {
  return (
    execGit(["rev-parse", "--is-inside-work-tree"], {
      allowFailure: true,
      cwd,
    }).trim() === "true"
  );
}

export function gitAddAll(cwd?: string): void {
  execGit(["add", "."], { cwd });
}

export function gitCommit(message: string, cwd?: string): void {
  execGit(["commit", "-m", message], { cwd });
}
