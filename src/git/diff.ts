import { execGit } from "./runner";

/** 获取新增文件的路径及其内容，用于大模型审查。 */
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

/**
 * 获取暂存区中所有新增文件的路径列表。
 * 通过 git diff --cached --name-status --diff-filter=A 获取。
 */
export function getStagedNewFiles(): string[] {
  const output = execGit(
    ["diff", "--cached", "--name-status", "--diff-filter=A"],
    { tolerateError: true },
  );
  if (!output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.startsWith("A\t"))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

/**
 * 获取工作区中所有新增未暂存文件的路径列表。
 * 通过 git diff --name-status --diff-filter=A 获取。
 */
function getUnstagedNewFiles(): string[] {
  const output = execGit(["diff", "--name-status", "--diff-filter=A"], {
    tolerateError: true,
  });
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
