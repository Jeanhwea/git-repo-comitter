import { execGit } from "./runner";

/**
 * 文件变更模块：建模并采集「哪些文件变了、怎么变的」，与「文本 diff」解耦。
 * 把原先堆在 diff.ts 里的变更采集逻辑迁至此，并以 ChangeSet 作为一等模型。
 */

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied";

export interface FileChange {
  path: string;
  status: ChangeStatus;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

export interface ChangeSet {
  files: FileChange[];
  newFiles: FileChange[]; // status === "added"
  binaryFiles: FileChange[]; // isBinary === true
  hasStagedChanges: boolean;
  hasChangesToStage: boolean; // 是否有需 git add 的未暂存变更
}

type NewFileScope = "staged" | "unstaged";

function listNewFiles(scope: NewFileScope): string[] {
  const args =
    scope === "staged"
      ? ["diff", "--cached", "--name-status", "--diff-filter=A"]
      : ["diff", "--name-status", "--diff-filter=A"];
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

  const binarySet = new Set(getStagedFileStats().filter((s) => s.isBinary).map((s) => s.path));

  return newFiles.map((filePath) => {
    if (binarySet.has(filePath)) {
      return { path: filePath, content: "[二进制文件，内容已省略]" };
    }
    const content = execGit(["show", `:${filePath}`], { tolerateError: true });
    // 兜底：通过 NULL 字节检测二进制内容
    if (content.includes("\0")) {
      return { path: filePath, content: "[二进制文件，内容已省略]" };
    }
    return { path: filePath, content };
  });
}

export function hasStagedChanges(): boolean {
  const output = execGit(["diff", "--cached", "--name-only"], {
    tolerateError: true,
  });
  return output.trim().length > 0;
}

/**
 * 是否存在「需要 git add 暂存」的变更：未暂存的修改/删除，或未被跟踪的新文件。
 * 已暂存（X 列非空、Y 列为空格）的变更不算在内，因为 git add . 对此是空操作。
 */
export function hasChangesToStage(): boolean {
  const output = execGit(["status", "--porcelain"], { tolerateError: true });
  if (!output.trim()) return false;
  return output.split("\n").some((line) => line.length >= 2 && line[1] !== " ");
}

interface StagedFileStat {
  path: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

function getStagedFileStats(): StagedFileStat[] {
  const output = execGit(["diff", "--cached", "-z", "--numstat"], {
    tolerateError: true,
  });
  if (!output.trim()) return [];

  // With -z, --numstat uses NUL-separated entries:
  //   Normal:  "added\tdeleted\tpath"
  //   Rename:  "added\tdeleted\t" + NUL + oldpath + NUL + newpath
  const stats: StagedFileStat[] = [];
  const parts = output.split("\0");
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (!part) {
      i++;
      continue;
    }
    // Rename/copy: path is empty after the second tab; old and new
    // paths follow as the next two NUL-separated fields.
    const renameMatch = part.match(/^(\d+|-)\t(\d+|-)\t$/);
    if (renameMatch) {
      const newPath = parts[i + 2];
      if (newPath) {
        stats.push({
          path: newPath,
          isBinary: renameMatch[1] === "-" || renameMatch[2] === "-",
          additions: renameMatch[1] === "-" ? 0 : Number(renameMatch[1]),
          deletions: renameMatch[2] === "-" ? 0 : Number(renameMatch[2]),
        });
      }
      i += 3;
      continue;
    }
    // Normal entry: all three fields in one NUL-separated chunk.
    const match = part.match(/^(\d+|-)\t(\d+|-)\t(.+)$/s);
    if (match) {
      stats.push({
        path: match[3],
        isBinary: match[1] === "-" || match[2] === "-",
        additions: match[1] === "-" ? 0 : Number(match[1]),
        deletions: match[2] === "-" ? 0 : Number(match[2]),
      });
    }
    i++;
  }
  return stats;
}

/**
 * 采集当前暂存区的完整变更集。供审查门禁、提交流程等以结构化方式消费，
 * 也可直接调用 getNewFileContents / hasStagedChanges 等兼容原接口的函数。
 */
export function getStagedChangeSet(): ChangeSet {
  const stats = getStagedFileStats();
  const addedPaths = new Set(getStagedNewFiles());
  const files: FileChange[] = stats.map((s) => ({
    path: s.path,
    status: addedPaths.has(s.path) ? "added" : "modified",
    isBinary: s.isBinary,
    additions: s.additions,
    deletions: s.deletions,
  }));
  return {
    files,
    newFiles: files.filter((f) => f.status === "added"),
    binaryFiles: files.filter((f) => f.isBinary),
    hasStagedChanges: files.length > 0,
    hasChangesToStage: hasChangesToStage(),
  };
}
