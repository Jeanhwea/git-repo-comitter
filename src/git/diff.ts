import { execGit } from "./runner";

export function getAllDiff(): string {
  const staged = execGit(["diff", "--cached"], { tolerateError: true });
  const unstaged = execGit(["diff"], { tolerateError: true });

  const parts: string[] = [];
  if (staged.trim()) parts.push("=== Staged Changes ===\n" + staged);
  if (unstaged.trim()) parts.push("=== Unstaged Changes ===\n" + unstaged);
  return parts.join("\n\n");
}

export function hasStagedChanges(): boolean {
  const result = execGit(["diff", "--cached", "--name-only"], {
    tolerateError: true,
  });
  return result.trim().length > 0;
}
