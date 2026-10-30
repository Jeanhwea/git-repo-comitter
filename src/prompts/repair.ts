/**
 * 通用修复提示（提示词文本）。
 *
 * 面向模型的文本统一在提示词模块维护，重试基础设施（infra/llm/retry）只负责编排。
 * @param label - 失败步骤的名称（如「提交信息」），用于拼装修复提示。
 * @param reason - 校验失败原因，逐字回传给模型要求其按此修正。
 */
export const defaultRepairHint = (label: string, reason: string): string =>
  `上一次输出的${label}未通过校验：${reason}。必须严格按照系统提示词的要求重新生成：只输出结果本身，禁止添加任何解释或代码围栏；输出语言必须与系统提示词的要求一致。`;
