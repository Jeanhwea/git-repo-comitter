import { execGit } from "./runner";

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

  const binarySet = new Set(
    getStagedFileStats()
      .filter((s) => s.isBinary)
      .map((s) => s.path),
  );

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

interface StagedFileStat {
  path: string;
  isBinary: boolean;
}

function getStagedFileStats(): StagedFileStat[] {
  const output = execGit(["diff", "--cached", "-z", "--numstat"], {
    tolerateError: true,
  });
  if (!output.trim()) return [];

  // With -z, --numstat uses NUL-separated entries:
  //   Normal:  "added\tdeleted\tpath"
  //   Rename:  "added\tdeleted\t" + NUL + oldpath + NUL + newpath
  // The rename format leaves the path field empty (just a trailing tab),
  // so a simple per-entry regex misses renames entirely.
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
      });
    }
    i++;
  }
  return stats;
}

export function getStagedDiff(): string {
  const stats = getStagedFileStats();
  if (stats.length === 0) return "";

  const textFiles = stats.filter((s) => !s.isBinary);
  const binaryFiles = stats.filter((s) => s.isBinary);

  let diff = "";
  if (textFiles.length > 0) {
    const args = ["diff", "--cached"];
    if (binaryFiles.length > 0) {
      args.push("--", ":(top)");
      for (const file of binaryFiles) {
        args.push(`:(exclude,top)${file.path}`);
      }
    }
    diff = execGit(args, { tolerateError: true });
    if (!diff.trim() && binaryFiles.length > 0) {
      diff = execGit(["diff", "--cached"], {
        tolerateError: true,
      });
    }
  }

  if (binaryFiles.length > 0) {
    const binaryList = binaryFiles.map((s) => `  - ${s.path}`).join("\n");
    diff += `${diff ? "\n\n" : ""}=== 二进制文件变更（仅显示文件名）===\n${binaryList}\n`;
  }

  return diff;
}
