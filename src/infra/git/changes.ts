import { execGit } from "./runner";

/**
 * 文件变更模块：建模并采集「哪些文件变了、怎么变的」，与「文本 diff」解耦。
 * 把原先堆在 diff.ts 里的变更采集逻辑迁至此，并以 ChangeSet 作为一等模型。
 */

/**
 * 单个文件的变更类型。
 * 注意：numstat 只给出增删行数，无法区分删除与重命名，
 * 因此当前采集结果只会出现 added 与 modified 两种。
 */
export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
  path: string;
  status: ChangeStatus;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

export interface ChangeSet {
  /** 暂存区内的全部变更文件。 */
  files: FileChange[];
  /** 新增文件（status === "added"），供提交前审查使用。 */
  newFiles: FileChange[];
  /** 二进制文件（isBinary === true），diff 中需被排除。 */
  binaryFiles: FileChange[];
  /** 暂存区是否已有变更。 */
  hasStagedChanges: boolean;
  /** 是否还有未暂存的变更（含未跟踪的新文件），需要 git add 才会进入提交。 */
  hasUnstagedChanges: boolean;
}

type NewFileScope = "staged" | "unstaged";

function listNewFiles(scope: NewFileScope): string[] {
  const args =
    scope === "staged"
      ? ["diff", "--cached", "--name-status", "--diff-filter=A"]
      : ["diff", "--name-status", "--diff-filter=A"];
  const output = execGit(args, { allowFailure: true });
  if (!output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.startsWith("A\t"))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function listStagedNewFiles(): string[] {
  return listNewFiles("staged");
}

function listUnstagedNewFiles(): string[] {
  return listNewFiles("unstaged");
}

/** 读取新增文件的内容；二进制文件与读不到的内容以占位文本代替。 */
export function readNewFileContents(
  onlyStaged: boolean = false,
): { path: string; content: string }[] {
  const stagedNewFiles = listStagedNewFiles();
  const stagedSet = new Set(stagedNewFiles);
  const newFiles = onlyStaged
    ? stagedNewFiles
    : [
        ...stagedNewFiles,
        ...listUnstagedNewFiles().filter((f) => !stagedSet.has(f)),
      ];

  const binarySet = new Set(
    getStagedFileStats()
      .filter((s) => s.isBinary)
      .map((s) => s.path),
  );

  return newFiles.map((filePath) => {
    if (binarySet.has(filePath)) {
      return { path: filePath, content: "[二进制文件，内容已省略]" };
    }
    const content = execGit(["show", `:${filePath}`], { allowFailure: true });
    // 兜底：通过 NULL 字节检测二进制内容
    if (content.includes("\0")) {
      return { path: filePath, content: "[二进制文件，内容已省略]" };
    }
    return { path: filePath, content };
  });
}

export function hasStagedChanges(): boolean {
  // 与变更集同源（numstat），避免出现「是否有暂存变更」的两种判定口径。
  return getStagedFileStats().length > 0;
}

/**
 * 是否存在尚未暂存的变更：未暂存的修改/删除，或未被跟踪的新文件。
 * 已暂存（X 列非空、Y 列为空格）的变更不算在内，因为 git add . 对此是空操作。
 */
export function hasUnstagedChanges(): boolean {
  const output = execGit(["status", "--porcelain"], { allowFailure: true });
  if (!output.trim()) return false;
  return output.split("\n").some((line) => line.length >= 2 && line[1] !== " ");
}

interface StagedFileStat {
  path: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

/** numstat 中 "-" 表示二进制文件（无行统计）。 */
function toStat(add: string, del: string, path: string): StagedFileStat {
  return {
    path,
    isBinary: add === "-" || del === "-",
    additions: add === "-" ? 0 : Number(add),
    deletions: del === "-" ? 0 : Number(del),
  };
}

function getStagedFileStats(): StagedFileStat[] {
  const output = execGit(["diff", "--cached", "-z", "--numstat"], {
    allowFailure: true,
  });
  if (!output.trim()) return [];

  // -z 下 --numstat 以 NUL 分隔字段：
  //   普通条目："added\tdeleted\tpath"
  //   重命名条目："added\tdeleted\t" + NUL + oldpath + NUL + newpath
  const stats: StagedFileStat[] = [];
  const fields = output.split("\0");
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (!field) {
      i++;
      continue;
    }
    // 重命名/复制：第二个制表符后路径为空，新旧路径作为后续两个字段给出。
    const renameEntry = field.match(/^(\d+|-)\t(\d+|-)\t$/);
    if (renameEntry) {
      const newPath = fields[i + 2];
      if (newPath) {
        stats.push(toStat(renameEntry[1], renameEntry[2], newPath));
      }
      i += 3;
      continue;
    }
    // 普通条目：三个字段都在同一个 NUL 分隔块内。
    const entry = field.match(/^(\d+|-)\t(\d+|-)\t(.+)$/s);
    if (entry) {
      stats.push(toStat(entry[1], entry[2], entry[3]));
    }
    i++;
  }
  return stats;
}

/**
 * 采集当前暂存区的完整变更集。供审查门禁、提交流程等以结构化方式消费，
 * 也可直接调用 getNewFileContents / hasStagedChanges / hasUnstagedChanges。
 */
export function getStagedChangeSet(): ChangeSet {
  const stats = getStagedFileStats();
  const addedPaths = new Set(listStagedNewFiles());
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
    hasUnstagedChanges: hasUnstagedChanges(),
  };
}
