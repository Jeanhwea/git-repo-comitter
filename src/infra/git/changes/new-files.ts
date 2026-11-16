/**
 * 新内容清单层：列出需要提交前审查的「新内容文件」并读取其内容。
 *
 * 与 --raw 变更集解耦：审查关心的是「仓库里新出现的可审文本」，因此以
 * --name-status -z 的 A/R/C 目标为准，删除与子模块不纳入。
 */
import { execGit, tryExecGit } from "../executor";

import { getStagedFileStats } from "./staged-stats";
import type { NewFileScope } from "./types";

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

  // -z 下每个字段以 NUL 分隔：普通条目 "A" NUL "path" NUL，
  // 重命名/复制 "R100" NUL "oldpath" NUL "newpath" NUL。
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
