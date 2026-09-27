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
const wrapNewFile = (path: string, content: string): string =>
  `<file path="${path}" size="${content.length}">\n${content}\n</file>`;

/** 包裹全部新增文件。 */
export const wrapNewFiles = (files: NewFileContent[]): string =>
  `<new_files>\n${files.map((f) => wrapNewFile(f.path, f.content)).join("\n\n")}\n</new_files>`;
