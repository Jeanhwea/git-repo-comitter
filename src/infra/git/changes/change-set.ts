/**
 * 变更集组装层：把解析层的 StagedFileStat 组装为对外的 ChangeSet，
 * 并提供「是否有暂存/未暂存变更」两个查询。
 */
import { execGit } from "../executor";

import { getStagedFileStats } from "./staged-stats";
import type { ChangeSet, FileChange } from "./types";

export function hasStagedChanges(cwd?: string): boolean {
  // 与变更集同源（numstat/raw），避免出现「是否有暂存变更」的两种判定口径。
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

/**
 * 采集当前暂存区的完整变更集。供审查门禁、提交流程等以结构化方式消费，
 * 也可直接调用 readNewFileContents / hasStagedChanges / hasUnstagedChanges。
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
