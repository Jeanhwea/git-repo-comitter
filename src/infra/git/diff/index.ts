import { getStagedChangeSet } from "../changes";
import { buildStagedDiff } from "./process";

export * from "./split";
export { buildStagedDiff } from "./process";

/**
 * 取得可直接喂给 LLM 的暂存区 diff：
 * 排除二进制内容、追加二进制文件名清单段。逻辑委托给 process 层，
 * 二进制清单来自 changes 模块的变更集，保证 diff 与 change 同源。
 */
export function getStagedDiff(): string {
  const { files, binaryFiles } = getStagedChangeSet();
  if (files.length === 0) return "";
  const hasTextFiles = files.some((f) => !f.isBinary);
  return buildStagedDiff(
    binaryFiles.map((b) => b.path),
    hasTextFiles,
  );
}
