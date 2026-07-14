import { execGit } from "./runner";

/**
 * 检测文件是否为二进制文件。
 * git diff --numstat 对二进制文件返回 "-\t-\tpath"
 */
function isBinaryFile(filePath: string, staged: boolean): boolean {
  const args = staged
    ? ["diff", "--cached", "--numstat", filePath]
    : ["diff", "--numstat", filePath];
  const result = execGit(args, { tolerateError: true });
  const match = result.match(/^(-\t-|[0-9]+\t-|-\t[0-9]+)\t/);
  return match !== null;
}

/** 过滤掉二进制文件的差异，并同时输出变更文件列表 */
function filterBinaryDiffs(diff: string, staged: boolean): string {
  const lines = diff.split("\n");
  const result: string[] = [];
  const textFiles: string[] = [];
  const binaryFiles: string[] = [];
  let currentFile = "";
  let inBinaryBlock = false;

  for (const line of lines) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\//);
    if (diffMatch) {
      currentFile = diffMatch[1];
      if (isBinaryFile(currentFile, staged)) {
        binaryFiles.push(currentFile);
        inBinaryBlock = true;
        continue;
      }
      textFiles.push(currentFile);
      inBinaryBlock = false;
    }

    if (!inBinaryBlock) {
      result.push(line);
    }
  }

  const fileList: string[] = [];
  if (textFiles.length > 0) {
    fileList.push(
      `--- 文本文件变更 (${textFiles.length}): ${textFiles.join(", ")}`,
    );
  }
  if (binaryFiles.length > 0) {
    fileList.push(
      `--- 二进制文件差异已忽略 (${binaryFiles.length}): ${binaryFiles.join(", ")}`,
    );
  }

  if (fileList.length > 0) {
    result.unshift(...fileList);
  }

  return result.join("\n");
}

export function getAllDiff(): string {
  const staged = filterBinaryDiffs(
    execGit(["diff", "--cached"], { tolerateError: true }),
    true,
  );
  const unstaged = filterBinaryDiffs(
    execGit(["diff"], { tolerateError: true }),
    false,
  );

  const parts: string[] = [];
  if (staged.trim()) parts.push("=== Staged Changes ===\n" + staged);
  if (unstaged.trim()) parts.push("=== Unstaged Changes ===\n" + unstaged);
  return parts.join("\n\n");
}

/**
 * 获取新增文件的路径及其内容，用于大模型审查。
 * 支持 staged 和 unstaged 的新增文件。
 */
export function getNewFileContents(
  onlyStaged: boolean = false,
): { path: string; content: string }[] {
  const stagedNewFiles = getStagedNewFiles();
  const newFiles = onlyStaged
    ? stagedNewFiles
    : [
        ...stagedNewFiles,
        ...getUnstagedNewFiles().filter(
          (f) => !stagedNewFiles.includes(f),
        ),
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
  const output = execGit(
    ["diff", "--name-status", "--diff-filter=A"],
    { tolerateError: true },
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
