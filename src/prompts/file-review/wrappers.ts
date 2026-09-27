/**
 * 用户消息的构造。与系统提示词保持同一套 XML 标记风格：
 * 文件内容是不可信数据，包进 file 标记后与审查指令形成清晰边界。
 */

/** 待审查的新增文件：路径与内容（不可读时以占位文本代替）。 */
export interface NewFileContent {
  path: string;
  content: string;
}

/** 包裹单个新增文件，路径写在 path 属性、内容字符数写在 size 属性上。 */
export const wrapNewFile = (path: string, content: string): string =>
  `<file path="${path}" size="${content.length}">\n${content}\n</file>`;

/** 包裹全部新增文件。 */
export const wrapNewFiles = (files: NewFileContent[]): string =>
  `<new_files>\n${files.map((f) => wrapNewFile(f.path, f.content)).join("\n\n")}\n</new_files>`;

/** 审查结果校验失败时的修复提示，用于重试。 */
export const reviewRepairHint = (reason: string): string =>
  `上一次输出未通过校验：${reason}。必须重新输出一个合法的 JSON 对象：` +
  `键名必须用双引号且保持英文（shouldCommit、suspiciousFiles、reason），禁止注释、尾随逗号、单引号、Markdown 代码围栏与任何解释文字；` +
  `shouldCommit 必须是布尔值，suspiciousFiles 必须是字符串数组，reason 必须是长度不超过 80 个字符的字符串。` +
  `只输出 JSON 对象本身。输出语言仍为简体中文，参照 language 节。`;
