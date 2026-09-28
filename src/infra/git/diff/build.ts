import { execGit } from "../runner";

/**
 * 文件 diff 模块 —— 文本组装层。
 *
 * 负责把「暂存区文本 diff」与「二进制文件名清单段」拼成一份可喂给 LLM 的文本：
 * 二进制清单由调用方（index.ts）基于变更集给出，本层只做组装，不做变更判定。
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
    return execGit(["diff", "--cached"], { allowFailure: true });
  }

  let diff = "";
  // 存在文本文件时，排除二进制文件再取 diff，避免大二进制撑爆上下文。
  if (hasTextFiles) {
    const args = ["diff", "--cached", "--", ":(top)"];
    for (const file of binaryFiles) {
      args.push(`:(exclude,top)${file}`);
    }
    diff = execGit(args, { allowFailure: true });
    if (!diff.trim()) {
      diff = execGit(["diff", "--cached"], { allowFailure: true });
    }
  }

  // 无论是否有文本文件，都附上二进制文件名清单段。
  const binaryList = binaryFiles.map((f) => `  - ${f}`).join("\n");
  diff += `${diff ? "\n\n" : ""}=== 二进制文件变更（仅显示文件名）===\n${binaryList}\n`;
  return diff;
}
