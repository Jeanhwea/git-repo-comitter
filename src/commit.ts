import { execSync } from "child_process";

export function gitCommit(message: string, repoPath?: string): void {
  const cwd = repoPath || process.cwd();
  const escapedMessage = message.replace(/"/g, '\\"');
  execSync(`git commit -m "${escapedMessage}"`, { cwd, encoding: "utf-8" });
}

export function gitAddAll(repoPath?: string): void {
  const cwd = repoPath || process.cwd();
  execSync("git add -A", { cwd, encoding: "utf-8" });
}
