import type { ValidationOutcome } from "@/infra/llm/retry";

export const commitMessageRepairHint = (reason: string): string =>
  `上一次输出未通过校验：${reason}。\n` +
  `必须逐条对照系统提示词中的 rules 与 output 节重新生成提交信息：` +
  `标题使用半角冒号加空格、type 取自 commit_types、标题与正文每行不超过 78 个字符。` +
  `只输出提交信息本身，禁止添加任何解释或代码围栏。输出语言仍为简体中文，参照 language 节。`;

const ALLOWED_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

export function validateCommitMessage(
  message: string,
): ValidationOutcome<string> {
  const firstBlank = message.indexOf("\n\n");
  const header =
    firstBlank === -1 ? message.trim() : message.slice(0, firstBlank).trim();
  const body = firstBlank === -1 ? "" : message.slice(firstBlank + 2).trim();

  const headerPattern =
    /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<description>.+)$/;

  const match = header.match(headerPattern);
  if (!match) {
    return {
      valid: false,
      reason:
        "标题不符合 Conventional Commits 格式：type(optional scope): description",
    };
  }

  const { type } = match.groups!;

  if (!ALLOWED_TYPES.includes(type as AllowedType)) {
    return {
      valid: false,
      reason: `type 字段的值 "${type}" 不在允许的列表中 (${ALLOWED_TYPES.join(", ")})`,
    };
  }

  if (header.length > 78) {
    return {
      valid: false,
      reason: `标题行超过 78 字符限制 (当前 ${header.length} 字符)`,
    };
  }

  if (body) {
    if (firstBlank === -1) {
      return {
        valid: false,
        reason: "正文前需空一行",
      };
    }
    const lines = body.split("\n");
    const longLines = lines.filter((line) => line.length > 78);
    if (longLines.length > 0) {
      return {
        valid: false,
        reason: `正文行超出 78 字符限制: ${longLines.join(", ")}`,
      };
    }
  }

  return { valid: true, value: message };
}
