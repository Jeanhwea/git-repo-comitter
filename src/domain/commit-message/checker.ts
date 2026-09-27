/**
 * 领域层 —— 提交信息格式校验。
 *
 * 只保留校验规则：与 SYSTEM_PROMPT 的 rules / output 节一一对应，
 * 避免规则写了却没人校验、坏结果直接流到 git commit。
 * 校验失败时的修复提示文本已归入 prompts/commit-message/repair.ts（I06 的 P4）。
 */
import type { ValidationOutcome } from "@/infra/llm/retry";

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
