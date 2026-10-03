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
  `上一次输出未通过校验，命中的规则如下（方括号内为规则编号）：\n${reason}\n` +
  `必须逐条对照上述编号一次性全部修正后重新输出，禁止只改其中一条，也禁止解释或修改过程：\n` +
  `- [A4] 标题使用半角冒号加恰好一个半角空格分隔 type 与 description；[A3] scope 为小写英文连字符分词，空 scope 直接省略括号；[A6] description 非空且不以句号结尾。\n` +
  `- [C1] 正文与标题相隔一个空行；[C2] 正文每行以半角连字符加空格 "- " 开头；[D1] 脚注写作 Token: value 或 Token #value。\n` +
  `- [B1][B2][B3] 只允许一个标题行，禁止第二条标题行、分隔线与序号候选，多主题变更合并为一条标题加一组要点。\n` +
  `- [A8] 标题行不超过 ${MAX_HEADER_LENGTH} 个字符，正文每行不超过 ${MAX_BODY_LINE_LENGTH} 个字符（正文比标题宽松）。\n` +
  `只输出提交信息本身，禁止添加任何解释或代码围栏。输出语言仍为简体中文，参照 language 节。`;
