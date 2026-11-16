/**
 * 暂存区统计解析层：把 git 的 --raw / --numstat 输出解析为结构化的 StagedFileStat。
 *
 * --raw 提供 XY 状态码与文件模式（用于区分 added/deleted/renamed/submodule），
 * --numstat 提供增删行数与二进制标记，两者按「变更后路径」关联。
 */
import { execGit } from "../executor";

import type { ChangeStatus, StagedFileStat } from "./types";

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
export function getNumstatByPath(cwd?: string): Map<string, StagedFileStat> {
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
export function getStagedFileStats(cwd?: string): StagedFileStat[] {
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
