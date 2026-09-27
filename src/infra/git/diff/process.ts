import { execGit } from "../runner";

/**
 * 文件 diff 模块 —— 处理层。
 * 把「暂存区文本 diff 抽取 + 二进制过滤 + 二进制段拼接」从原 diff.ts 迁来，
 * 由调用方（index.ts）基于变更集的二进制清单驱动，保持原算法不变。
 */

/**
 * 构造暂存区 diff 文本。
 * @param binaryFiles 变更集中被判定为二进制的文件路径
 * @param hasTextFiles 是否存在非二进制的文本文件变更
 */
export function buildStagedDiff(
  binaryFiles: string[],
  hasTextFiles: boolean,
): string {
  if (binaryFiles.length === 0) {
    return execGit(["diff", "--cached"], { tolerateError: true });
  }

  let diff = "";
  // 存在文本文件时，排除二进制文件再取 diff，避免大二进制撑爆上下文。
  if (hasTextFiles) {
    const args = ["diff", "--cached", "--", ":(top)"];
    for (const file of binaryFiles) {
      args.push(`:(exclude,top)${file}`);
    }
    diff = execGit(args, { tolerateError: true });
    if (!diff.trim()) {
      diff = execGit(["diff", "--cached"], { tolerateError: true });
    }
  }

  // 无论是否有文本文件，都附上二进制文件名清单段。
  const binaryList = binaryFiles.map((f) => `  - ${f}`).join("\n");
  diff += `${diff ? "\n\n" : ""}=== 二进制文件变更（仅显示文件名）===\n${binaryList}\n`;
  return diff;
}
