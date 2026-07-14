import { execFileSync } from "child_process";

export interface GitExecOptions {
  /** 返回空串而非抛错，适用于探测性命令。 */
  tolerateError?: boolean;
}

export function execGit(args: string[], options: GitExecOptions = {}): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
  } catch (err) {
    if (options.tolerateError) return "";
    throw err;
  }
}

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
