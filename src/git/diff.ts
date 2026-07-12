import { execSync } from "child_process";

function execGit(args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
  } catch {
    return "";
  }
}

export function getAllDiff(): string {
  const staged = execGit("diff --cached");
  const unstaged = execGit("diff");

  const parts: string[] = [];
  if (staged.trim()) {
    parts.push("=== Staged Changes ===\n" + staged);
  }
  if (unstaged.trim()) {
    parts.push("=== Unstaged Changes ===\n" + unstaged);
  }
  return parts.join("\n\n");
}

export function hasStagedChanges(): boolean {
  const result = execGit("diff --cached --name-only");
  return result.trim().length > 0;
}
