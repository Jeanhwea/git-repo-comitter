/**
 * 输出语言约束。
 *
 * 由提交信息生成（SYSTEM_PROMPT / PARTIAL_SYSTEM_PROMPT / MERGE_SYSTEM_PROMPT）
 * 与文件审查（REVIEW_SYSTEM_PROMPT）两类提示词共用，作为语言要求的唯一来源，
 * 避免同一条约束在多个提示词里各写一遍、改一处漏一处。
 *
 * 实体由 domain/shared/language.ts 迁入（I06 的 P4），使提示词模块不再反向依赖领域层。
 */
export const LANGUAGE_RULES = `<language>
1. 输出语言统一使用简体中文，禁止整句使用英文。
2. 以下内容保留原文，禁止翻译：代码标识符、文件名与路径、命令与命令行参数、第三方库与框架名、协议与规范名（如 Conventional Commits）、commit type 与 scope、git trailer 的 token（如 BREAKING CHANGE、Refs）。
3. 禁止中英混排句式（如「修复 login redirect 的 bug」）；中文语句中出现的英文只能是第 2 条允许的专有名词。
4. 禁止使用繁体字、方言与网络用语；描述文字使用中文全角标点，但提交信息标题的冒号必须是半角冒号加半角空格。
5. 结构化输出（如 JSON）的键名保持英文原样，只有取值使用简体中文。
</language>`;
