/**
 * 文件变更模块：建模并采集「哪些文件变了、怎么变的」，与「文本 diff」解耦。
 * 以 ChangeSet 作为一等模型，供 diff 组装层与审查门禁共享。
 *
 * F05：采集动作新增可选 cwd，使库调用方能指定目标仓库（commit(\{ repoPath \})）。
 * I08 W6：采集口径从「只产出 added/modified」扩到完整建模 added/modified/
 * deleted/renamed/submodule；状态来自 --raw 的 XY 状态码与文件模式，增删行数
 * 与二进制标记仍来自 --numstat，两者按路径关联。
 */
import { execGit, tryExecGit } from "./executor";

/**
 * 单个文件的变更类型。
 * - added / deleted / modified：常规增删改。
 * - renamed：路径变化，原路径保存在 FileChange.oldPath。
 * - submodule：gitlink（mode 160000）指针变化，指针内容不是文本 diff。
 */
export type ChangeStatus =
  "added" | "modified" | "deleted" | "renamed" | "submodule";

export interface FileChange {
  /** 变更后路径；renamed 时为新路径。 */
  path: string;
  status: ChangeStatus;
  /** renamed 时的原路径；其他状态为 undefined。 */
  oldPath?: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

export interface ChangeSet {
  /** 暂存区内的全部变更文件。 */
  files: FileChange[];
  /** 新增文件（status === "added"），供提交前审查使用。 */
  newFiles: FileChange[];
  /** 重命名文件（status === "renamed"），oldPath 指向原路径。 */
  renamedFiles: FileChange[];
  /** 删除的文件（status === "deleted"）。 */
  deletedFiles: FileChange[];
  /** 子模块指针变更（status === "submodule"）。 */
  submoduleFiles: FileChange[];
  /** 二进制文件（isBinary === true），diff 中需被排除。 */
  binaryFiles: FileChange[];
  /** 暂存区是否已有变更。 */
  hasStagedChanges: boolean;
  /** 是否还有未暂存的变更（含未跟踪的新文件），需要 git add 才会进入提交。 */
  hasUnstagedChanges: boolean;
}

type NewFileScope = "staged" | "unstaged";

/**
 * 列出需要审查的「新内容文件」路径。
 *
 * 原实现只用 --diff-filter=A 且按行解析，既漏掉重命名进来的新内容（I08 3.5），
 * 又会把含空白字符的路径截断。这里改为 -z 分隔，并纳入 rename/copy 的**新路径**：
 * 重命名后的文件对审查而言是仓库里新出现的内容，应以新路径送审，提示词要求的
 * suspiciousFiles 路径才能与输入一致。删除文件没有内容可审、子模块是指针变更，
 * 均不纳入。
 * @param scope - staged 为已暂存变更，unstaged 为工作区变更。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
function listNewFiles(scope: NewFileScope, cwd?: string): string[] {
  const args =
    scope === "staged"
      ? ["diff", "--cached", "--name-status", "-z", "--diff-filter=ARC"]
      : ["diff", "--name-status", "-z", "--diff-filter=ARC"];
  const result = tryExecGit(args, { cwd });
  if (!result.ok || !result.stdout) return [];

  // -z 下每个字段以 NUL 分隔：普通条目 "A\0path\0"，
  // 重命名/复制 "R100\0oldpath\0newpath\0"。
  const fields = result.stdout.split("\0");
  const paths: string[] = [];
  let i = 0;
  while (i < fields.length) {
    const code = fields[i] ?? "";
    if (!code) {
      i++;
      continue;
    }
    const letter = code[0];
    if (letter === "A") {
      const path = fields[i + 1];
      if (path) paths.push(path);
      i += 2;
      continue;
    }
    if (letter === "R" || letter === "C") {
      // 取新路径；oldPath 仅供变更集建模，不送审。
      const newPath = fields[i + 2];
      if (newPath) paths.push(newPath);
      i += 3;
      continue;
    }
    i++;
  }
  return paths;
}

function listStagedNewFiles(cwd?: string): string[] {
  return listNewFiles("staged", cwd);
}

function listUnstagedNewFiles(cwd?: string): string[] {
  return listNewFiles("unstaged", cwd);
}

/**
 * 读取新增文件的内容；二进制文件与读不到的内容以占位文本代替。
 * @param onlyStaged - true 时只读取已暂存的新文件，false 时包含未跟踪文件。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
export function readNewFileContents(
  onlyStaged: boolean = false,
  cwd?: string,
): { path: string; content: string }[] {
  const stagedNewFiles = listStagedNewFiles(cwd);
  const stagedSet = new Set(stagedNewFiles);
  const newFiles = onlyStaged
    ? stagedNewFiles
    : [
        ...stagedNewFiles,
        ...listUnstagedNewFiles(cwd).filter((f) => !stagedSet.has(f)),
      ];

  const binarySet = new Set(
    getStagedFileStats(cwd)
      .filter((s) => s.isBinary)
      .map((s) => s.path),
  );

  return newFiles.map((filePath) => {
    if (binarySet.has(filePath)) {
      return { path: filePath, content: "[二进制文件，内容已省略]" };
    }
    const content = execGit(["show", `:${filePath}`], {
      allowFailure: true,
      cwd,
    });
    // 兜底：通过 NULL 字节检测二进制内容
    if (content.includes("\0")) {
      return { path: filePath, content: "[二进制文件，内容已省略]" };
    }
    return { path: filePath, content };
  });
}

export function hasStagedChanges(cwd?: string): boolean {
  // 与变更集同源（numstat），避免出现「是否有暂存变更」的两种判定口径。
  return getStagedFileStats(cwd).length > 0;
}

/**
 * 是否存在尚未暂存的变更：未暂存的修改/删除，或未被跟踪的新文件。
 * 已暂存（X 列非空、Y 列为空格）的变更不算在内，因为 git add . 对此是空操作。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
export function hasUnstagedChanges(cwd?: string): boolean {
  const output = execGit(["status", "--porcelain"], {
    allowFailure: true,
    cwd,
  });
  if (!output.trim()) return false;
  return output.split("\n").some((line) => line.length >= 2 && line[1] !== " ");
}

interface StagedFileStat {
  path: string;
  status: ChangeStatus;
  oldPath?: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

/** git --raw 记录中的文件模式，gitlink（子模块）为 160000。 */
const GITLINK_MODE = "160000";

/**
 * numstat 中 "-" 表示二进制文件（无行统计）。
 * @param add - numstat 的第一列（新增行数，"-" 表示二进制文件）。
 * @param del - numstat 的第二列（删除行数，"-" 表示二进制文件）。
 */
function toAddDel(
  add: string,
  del: string,
): {
  isBinary: boolean;
  additions: number;
  deletions: number;
} {
  return {
    isBinary: add === "-" || del === "-",
    additions: add === "-" ? 0 : Number(add),
    deletions: del === "-" ? 0 : Number(del),
  };
}

/**
 * 解析 --numstat -z 的输出，按「变更后路径」索引增删行数与二进制标记。
 * -z 下的字段（TAB 表示制表符、NUL 表示空字符）：
 *   普通条目："added TAB deleted TAB path"
 *   重命名条目："added TAB deleted TAB" + NUL + oldpath + NUL + newpath
 * 重命名以 newPath 为键，与 --raw 记录的路径口径一致。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
function getNumstatByPath(cwd?: string): Map<string, StagedFileStat> {
  const output = execGit(["diff", "--cached", "-z", "--numstat"], {
    allowFailure: true,
    cwd,
  });
  const byPath = new Map<string, StagedFileStat>();
  if (!output.trim()) return byPath;

  const fields = output.split("\0");
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (!field) {
      i++;
      continue;
    }
    const renameEntry = field.match(/^(\d+|-)\t(\d+|-)\t$/);
    if (renameEntry) {
      const newPath = fields[i + 2];
      if (newPath) {
        byPath.set(newPath, {
          path: newPath,
          status: "renamed",
          ...toAddDel(renameEntry[1] ?? "", renameEntry[2] ?? ""),
        });
      }
      i += 3;
      continue;
    }
    const entry = field.match(/^(\d+|-)\t(\d+|-)\t(.+)$/s);
    if (entry) {
      const path = entry[3] ?? "";
      byPath.set(path, {
        path,
        status: "modified",
        ...toAddDel(entry[1] ?? "", entry[2] ?? ""),
      });
    }
    i++;
  }
  return byPath;
}

/**
 * 把一个 --raw 状态码映射为 ChangeStatus。
 * X（unknown）、U（unmerged）等异常码按 modified 归类，避免丢弃变更。
 * @param code - raw 记录的状态码，可能带相似度后缀（如 R091）。
 */
function statusFromRaw(code: string): ChangeStatus {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
    case "C":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * 从 --raw -z 的输出解析暂存区文件状态（NUL 表示空字符分隔）。
 * 每条记录形如：":100644 100644 oldsha newsha M" NUL "path" NUL；
 * 重命名/复制：":... R091" NUL "oldpath" NUL "newpath" NUL。
 * 状态码携带 A/M/D/R/C，文件模式可识别 gitlink（子模块）。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
function getStagedRawEntries(cwd?: string): StagedFileStat[] {
  const output = execGit(["diff", "--cached", "--raw", "-z"], {
    allowFailure: true,
    cwd,
  });
  if (!output.trim()) return [];

  // 形如 ":100644 100644 abc1234 def5678 M" 或 ":100644 100644 ... R091"
  const headerPattern = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z]\d*)$/;
  const fields = output.split("\0");
  const result: StagedFileStat[] = [];
  let i = 0;
  while (i < fields.length) {
    const header = fields[i];
    if (!header) {
      i++;
      continue;
    }
    const match = header.match(headerPattern);
    if (!match) {
      i++;
      continue;
    }
    const oldMode = match[1] ?? "";
    const newMode = match[2] ?? "";
    const code = match[3] ?? "";
    const status = statusFromRaw(code);
    const isSubmodule = oldMode === GITLINK_MODE || newMode === GITLINK_MODE;

    if (status === "renamed") {
      const oldPath = fields[i + 1];
      const newPath = fields[i + 2];
      if (oldPath && newPath) {
        result.push({
          path: newPath,
          status,
          oldPath,
          isBinary: false,
          additions: 0,
          deletions: 0,
        });
      }
      i += 3;
      continue;
    }

    const path = fields[i + 1];
    if (path) {
      result.push({
        path,
        status: isSubmodule ? "submodule" : status,
        isBinary: false,
        additions: 0,
        deletions: 0,
      });
    }
    i += 2;
  }
  return result;
}

/**
 * 采集暂存区文件统计：以 --raw 的状态与模式为准，--numstat 补充行数与二进制标记。
 * 两条命令都带 allowFailure，探测场景下失败按空集合处理。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
function getStagedFileStats(cwd?: string): StagedFileStat[] {
  const raw = getStagedRawEntries(cwd);
  if (raw.length === 0) return [];
  const numstat = getNumstatByPath(cwd);
  return raw.map((entry) => {
    const stat = numstat.get(entry.path);
    // 子模块与删除文件没有文本行数，保持 raw 的零值。
    if (entry.status === "submodule" || entry.status === "deleted")
      return entry;
    return stat
      ? { ...entry, ...stat, status: entry.status, path: entry.path }
      : entry;
  });
}

/**
 * 采集当前暂存区的完整变更集。供审查门禁、提交流程等以结构化方式消费，
 * 也可直接调用 getNewFileContents / hasStagedChanges / hasUnstagedChanges。
 * @param cwd - 目标仓库路径，缺省为进程当前工作目录。
 */
export function getStagedChangeSet(cwd?: string): ChangeSet {
  const files: FileChange[] = getStagedFileStats(cwd).map((s) => ({
    path: s.path,
    status: s.status,
    ...(s.oldPath !== undefined ? { oldPath: s.oldPath } : {}),
    isBinary: s.isBinary,
    additions: s.additions,
    deletions: s.deletions,
  }));
  return {
    files,
    newFiles: files.filter((f) => f.status === "added"),
    renamedFiles: files.filter((f) => f.status === "renamed"),
    deletedFiles: files.filter((f) => f.status === "deleted"),
    submoduleFiles: files.filter((f) => f.status === "submodule"),
    binaryFiles: files.filter((f) => f.isBinary),
    hasStagedChanges: files.length > 0,
    hasUnstagedChanges: hasUnstagedChanges(cwd),
  };
}
