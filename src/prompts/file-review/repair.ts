/**
 * 文件审查结果校验失败时的修复提示（提示词文本）。
 *
 * 与 commit-message/repair.ts 对称：校验规则留在领域层（domain/file-review/checker.ts），
 * 面向模型的修复文本集中在提示词模块，便于统一维护。
 */
export const reviewRepairHint = (reason: string): string =>
  `上一次输出未通过校验：${reason}。必须重新输出一个合法的 JSON 对象：` +
  `键名必须用双引号且保持英文（shouldCommit、suspiciousFiles、reason），禁止注释、尾随逗号、单引号、Markdown 代码围栏与任何解释文字；` +
  `shouldCommit 必须是布尔值，suspiciousFiles 必须是字符串数组，reason 必须是长度不超过 80 个字符的字符串。` +
  `只输出 JSON 对象本身。输出语言仍为简体中文，参照 language 节。`;
