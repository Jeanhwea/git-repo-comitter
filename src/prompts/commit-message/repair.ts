/**
 * 提交信息校验失败时的修复提示（提示词文本）。
 *
 * 原先与校验逻辑同处 domain/commit-message/checker.ts（I06 的 P4）。
 * 校验规则留在领域层，提示词文本归位到提示词模块，两者各司其职。
 *
 * W3：逐条对照清单改由 shared/commit-rules 生成，避免手工维护漏掉编号，
 * 导致重试时模型只能看到部分规则。
 */
import { COMMIT_RULE_REPAIR_LIST } from "@/shared/commit-rules";

export const commitMessageRepairHint = (reason: string): string =>
  `上一次输出未通过校验，命中的规则如下（方括号内为规则编号）：\n${reason}\n` +
  `必须逐条对照上述编号一次性全部修正后重新输出，禁止只改其中一条，也禁止解释或修改过程：\n` +
  `完整规则清单（与校验器同源）：\n${COMMIT_RULE_REPAIR_LIST}。\n` +
  `只输出提交信息本身，禁止添加任何解释或代码围栏。输出语言仍为简体中文，参照 language 节。`;
