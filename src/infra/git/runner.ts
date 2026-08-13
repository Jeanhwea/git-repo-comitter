import { execFileSync } from "child_process";

export interface GitExecOptions {
  tolerateError?: boolean;
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

export function gitReset(files: string[]): void {
  if (files.length === 0) return;
  execGit(["reset", "--", ...files]);
}
