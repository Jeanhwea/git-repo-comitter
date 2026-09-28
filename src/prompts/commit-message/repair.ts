/**
 * 提交信息校验失败时的修复提示（提示词文本）。
 *
 * 原先与校验逻辑同处 domain/commit-message/checker.ts（I06 的 P4）。
 * 校验规则留在领域层，提示词文本归位到提示词模块，两者各司其职。
 *
 * 行宽上限与校验器共用 shared/commit-limits 的常量，避免提示词与校验口径不一致。
 */
import {
  MAX_BODY_LINE_LENGTH,
  MAX_HEADER_LENGTH,
} from "@/shared/commit-limits";

export const commitMessageRepairHint = (reason: string): string =>
  `上一次输出未通过校验：${reason}。\n` +
  `必须逐条对照系统提示词中的 rules 与 output 节重新生成提交信息：` +
  `标题使用半角冒号加空格、type 取自 commit_types；` +
  `标题行不超过 ${MAX_HEADER_LENGTH} 个字符，正文每行不超过 ${MAX_BODY_LINE_LENGTH} 个字符（正文比标题宽松）。` +
  `只输出提交信息本身，禁止添加任何解释或代码围栏。输出语言仍为简体中文，参照 language 节。`;
