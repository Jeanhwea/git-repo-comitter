/**
 * 文件变更模块入口：建模并采集「哪些文件变了、怎么变的」，与「文本 diff」解耦。
 * 以 ChangeSet 作为一等模型，供 diff 组装层与审查门禁共享。
 *
 * F05：采集动作新增可选 cwd，使库调用方能指定目标仓库（commit(\{ repoPath \})）。
 * I08 W6：采集口径从「只产出 added/modified」扩到完整建模 added/modified/
 * deleted/renamed/submodule；状态来自 --raw 的 XY 状态码与文件模式，增删行数
 * 与二进制标记仍来自 --numstat，两者按路径关联。
 *
 * 本文件只做公共 API 的汇总导出，实现按职责拆到 ./changes/ 子模块：
 * - types.ts       共享类型模型（ChangeStatus / FileChange / ChangeSet ...）
 * - staged-stats.ts --raw / --numstat 解析层
 * - change-set.ts  变更集组装与 hasStagedChanges / hasUnstagedChanges
 * - new-files.ts   新内容清单与 readNewFileContents
 *
 * 保持此入口的导出签名不变，vi.mock("\@/infra/git/changes") 的调用方零改动。
 */

export type { ChangeStatus, FileChange, ChangeSet } from "./changes/types";

export {
  getStagedChangeSet,
  hasStagedChanges,
  hasUnstagedChanges,
} from "./changes/change-set";

export { readNewFileContents } from "./changes/new-files";
