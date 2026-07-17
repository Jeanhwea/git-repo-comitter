import { execGit } from "./runner";

export function getNewFileContents(
  onlyStaged: boolean = false,
): { path: string; content: string }[] {
  const stagedNewFiles = getStagedNewFiles();
  const newFiles = onlyStaged
    ? stagedNewFiles
    : [
        ...stagedNewFiles,
        ...getUnstagedNewFiles().filter((f) => !stagedNewFiles.includes(f)),
      ];

  return newFiles.map((filePath) => ({
    path: filePath,
    content: execGit(["show", `:${filePath}`], { tolerateError: true }),
  }));
}

export function getStagedNewFiles(): string[] {
  const output = execGit(
    [
      "-c",
      "core.quotepath=false",
      "diff",
      "--cached",
      "--name-status",
      "--diff-filter=A",
    ],
    { tolerateError: true },
  );
  if (!output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.startsWith("A\t"))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function getUnstagedNewFiles(): string[] {
  const output = execGit(
    ["-c", "core.quotepath=false", "diff", "--name-status", "--diff-filter=A"],
    {
      tolerateError: true,
    },
  );
  if (!output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.startsWith("A\t"))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

export function hasStagedChanges(): boolean {
  const output = execGit(["diff", "--cached", "--name-only"], {
    tolerateError: true,
  });
  return output.trim().length > 0;
}

export function getStagedDiff(): string {
  return execGit(["diff", "--cached"], { tolerateError: true });
}
