import { execSync } from "child_process";

export interface GitCommitOptions {
  repoPath?: string;
  commitFlags?: string;
}

export function gitCommit(message: string, options?: GitCommitOptions): void {
  const cwd = options?.repoPath || process.cwd();
  const escapedMessage = message.replace(/"/g, '\\"');
  const flags = options?.commitFlags ? ` ${options.commitFlags}` : "";
  execSync(`git commit -m "${escapedMessage}"${flags}`, {
    cwd,
    encoding: "utf-8",
  });
}

export function gitAddAll(repoPath?: string): void {
  const cwd = repoPath || process.cwd();
  execSync("git add -A", { cwd, encoding: "utf-8" });
}
