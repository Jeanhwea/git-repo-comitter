/**
 * 提示词包裹层的 XML 转义（W4）。
 *
 * diff / 草稿 / 文件内容是不可信数据，若其中含有我们使用的闭合标记，
 * 模型会把数据误认为标记边界，造成注入或内容截断。这里只转义本项目使用的
 * 标记名，避免把源码里的 `<div>` 等普通符号全部变成实体而损失可读性。
 */

/** 包裹层使用的标记名。 */
const WRAPPER_TAGS = "diff|diff_part|draft|drafts|file|new_files|notice";

/**
 * 转义正文中的包裹标记，防止数据闭合外层标记。
 * @param text - 待放入 XML 标记内的不可信文本。
 */
export function escapeXmlText(text: string): string {
  return text
    .replace(
      new RegExp(`</(?:${WRAPPER_TAGS})>`, "g"),
      (match) => `&lt;${match.slice(1, -1)}&gt;`,
    )
    .replace(
      new RegExp(`<(?:${WRAPPER_TAGS})(?=[\\s>])`, "g"),
      (match) => `&lt;${match.slice(1)}`,
    );
}

/**
 * 转义 XML 属性值（路径中的引号会破坏属性边界）。
 * @param value - 待写入属性的值。
 */
export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
