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

/** 包裹全部草稿。 */
export const wrapDrafts = (drafts: string[]): string =>
  `<drafts>\n${drafts.join("\n\n")}\n</drafts>`;

/** 合并时因长度限制被丢弃的批次提示。 */
export const wrapOmissionNotice = (count: number): string =>
  `<notice>另有 ${count} 个批次的草稿因长度限制已省略</notice>`;
