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
  const output = execGit(
    ["-c", "core.quotepath=false", "diff", "--cached", "-z", "--numstat"],
    { tolerateError: true },
  );
  if (!output.trim()) return [];

  const stats: StagedFileStat[] = [];
  for (const entry of output.split("\0")) {
    if (!entry) continue;
    const match = entry.match(/^(\d+|-)\t(\d+|-)\t(.+)$/s);
    if (!match) continue;
    const added = match[1];
    const deleted = match[2];
    const path = match[3];
    stats.push({
      path,
      isBinary: added === "-" || deleted === "-",
    });
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
    diff = execGit(
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--cached",
        "--",
        ...textFiles.map((s) => s.path),
      ],
      { tolerateError: true },
    );
  }

  if (binaryFiles.length > 0) {
    const binaryList = binaryFiles.map((s) => `  - ${s.path}`).join("\n");
    diff += `${diff ? "\n\n" : ""}=== 二进制文件变更（仅显示文件名）===\n${binaryList}\n`;
  }

  return diff;
}
