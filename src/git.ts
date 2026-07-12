import { execSync } from "child_process";

function getStagedDiff(): string {
  try {
    return execSync("git diff --cached", {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
  } catch {
    return "";
  }
}

function getUnstagedDiff(): string {
  try {
    return execSync("git diff", { cwd: process.cwd(), encoding: "utf-8" });
  } catch {
    return "";
  }
}

export function getAllDiff(): string {
  const staged = getStagedDiff();
  const unstaged = getUnstagedDiff();

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
  try {
    const result = execSync("git diff --cached --name-only", {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
