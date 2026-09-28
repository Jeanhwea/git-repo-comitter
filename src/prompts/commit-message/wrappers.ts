/**
 * 用户消息的构造。与系统提示词保持同一套 XML 标记风格：
 * 把 diff、草稿这类不可信内容包进标记内，明确其"数据"身份，降低被模型当作指令执行的风险。
 */

/** 包裹完整 diff。 */
export const wrapDiff = (diff: string): string => `<diff>\n${diff}\n</diff>`;

/** 包裹分批场景下的部分 diff。 */
export const wrapPartialDiff = (diff: string): string =>
  `<diff_part>\n${diff}\n</diff_part>`;

/** 包裹单条草稿，index 从 1 开始。 */
export const wrapDraft = (index: number, draft: string): string =>
  `<draft index="${index}">\n${draft}\n</draft>`;

/** 包裹草稿集合（若干条已包裹好的草稿文本）。 */
const wrapDraftList = (drafts: string[]): string =>
  `<drafts>\n${drafts.join("\n\n")}\n</drafts>`;

/** 合并时因长度限制被丢弃的批次提示。 */
const wrapOmissionNotice = (count: number): string =>
  `<notice>另有 ${count} 个批次的草稿因长度限制已省略</notice>`;

/** 合并阶段的输入：已按 token 预算裁剪好的草稿文本，以及被丢弃的批次数。 */
export interface MergeDraftsInput {
  /** 已用 wrapDraft 包裹、且按 token 预算裁剪后保留下来的草稿。 */
  drafts: string[];
  /** 因预算不足被丢弃的草稿条数，>0 时附 notice 提示。 */
  omittedDrafts: number;
}

/**
 * 包裹合并阶段的全部草稿，并在有丢弃时附上省略提示。
 * 裁剪（依据 token 预算决定保留几条）属于基础设施职责，由调用方完成；
 * 这里只负责标记包裹，使提示词模块不必依赖 token 估算。
 */
export const wrapDraftsForMerge = (
  drafts: string[],
  omittedDrafts: number,
): string =>
  wrapDraftList(drafts) +
  (omittedDrafts > 0 ? `\n\n${wrapOmissionNotice(omittedDrafts)}` : "");
