/**
 * 通用修复提示（提示词文本）。
 *
 * 原先内联在 infra/llm/retry.ts 的默认分支里，属于提示词却混在调用基础设施中（I06 的 P4）。
 * 归入提示词模块后，所有面向模型的文本集中一处，便于统一维护。
 */
export const defaultRepairHint = (label: string, reason: string): string =>
  `上一次输出的${label}未通过校验：${reason}。必须严格按照系统提示词的要求重新生成：只输出结果本身，禁止添加任何解释或代码围栏；输出语言必须与系统提示词的要求一致。`;
