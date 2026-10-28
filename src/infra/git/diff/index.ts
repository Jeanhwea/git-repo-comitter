import { getStagedChangeSet } from "../changes";

import { buildStagedDiff } from "./build";

export * from "./split";
export { buildStagedDiff };

/**
 * 取得可直接喂给 LLM 的暂存区 diff：
 * 排除二进制内容、追加二进制文件名清单段。文本组装委托给 build 层，
 * 二进制清单来自 changes 模块的变更集，保证 diff 与 change 同源。
 * @param cwd - 目标仓库路径，缺省为 process.cwd()
 */
export function getStagedDiff(cwd?: string): string {
  const { files, binaryFiles } = getStagedChangeSet(cwd);
  if (files.length === 0) return "";
  const hasTextFiles = files.some((f) => !f.isBinary);
  return buildStagedDiff(
    binaryFiles.map((b) => b.path),
    hasTextFiles,
    cwd,
  );
}
