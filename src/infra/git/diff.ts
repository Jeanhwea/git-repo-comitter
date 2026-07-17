import { execGit } from "./runner";

type NewFileScope = "staged" | "unstaged";

function listNewFiles(scope: NewFileScope): string[] {
  const args =
    scope === "staged"
      ? [
          "-c",
          "core.quotepath=false",
          "diff",
          "--cached",
          "--name-status",
          "--diff-filter=A",
        ]
      : [
          "-c",
          "core.quotepath=false",
          "diff",
          "--name-status",
          "--diff-filter=A",
        ];
  const output = execGit(args, { tolerateError: true });
  if (!output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.startsWith("A\t"))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

export function getStagedNewFiles(): string[] {
  return listNewFiles("staged");
}

function getUnstagedNewFiles(): string[] {
  return listNewFiles("unstaged");
}

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

export function hasStagedChanges(): boolean {
  const output = execGit(["diff", "--cached", "--name-only"], {
    tolerateError: true,
  });
  return output.trim().length > 0;
}

export function getStagedDiff(): string {
  return execGit(["diff", "--cached"], { tolerateError: true });
}
