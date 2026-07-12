import { execSync } from "child_process";

function getStagedDiff(repoPath?: string): string {
  const cwd = repoPath || process.cwd();
  try {
    return execSync("git diff --cached", { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}

function getUnstagedDiff(repoPath?: string): string {
  const cwd = repoPath || process.cwd();
  try {
    return execSync("git diff", { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}

export function getAllDiff(repoPath?: string): string {
  const cwd = repoPath || process.cwd();
  const staged = getStagedDiff(cwd);
  const unstaged = getUnstagedDiff(cwd);

  const parts: string[] = [];
  if (staged.trim()) {
    parts.push("=== Staged Changes ===\n" + staged);
  }
  if (unstaged.trim()) {
    parts.push("=== Unstaged Changes ===\n" + unstaged);
  }
  return parts.join("\n\n");
}

export function hasStagedChanges(repoPath?: string): boolean {
  const cwd = repoPath || process.cwd();
  try {
    const result = execSync("git diff --cached --name-only", {
      cwd,
      encoding: "utf-8",
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
