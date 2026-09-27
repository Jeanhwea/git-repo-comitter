/**
 * 领域层 —— 提交信息格式校验。
 *
 * 只保留校验规则：与 COMMIT_SYSTEM_PROMPT 的 rules / output 节一一对应，
 * 避免规则写了却没人校验、坏结果直接流到 git commit。
 * 校验失败时的修复提示文本已归入 prompts/commit-message/repair.ts（I06 的 P4）。
 */
import type { ValidationOutcome } from "@/infra/llm/retry";

const ALLOWED_TYPES = new Set([
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
]);

const HEADER_PATTERN =
  /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<description>.+)$/;

const MAX_LINE_LENGTH = 78;

export function validateCommitMessage(
  message: string,
): ValidationOutcome<string> {
  // 标题与正文以空行分隔；没有空行说明只有标题。
  const bodyBreak = message.indexOf("\n\n");
  const header =
    bodyBreak === -1 ? message.trim() : message.slice(0, bodyBreak).trim();
  const body = bodyBreak === -1 ? "" : message.slice(bodyBreak + 2).trim();

  const matched = header.match(HEADER_PATTERN);
  if (!matched) {
    return {
      valid: false,
      reason:
        "标题不符合 Conventional Commits 格式：type(optional scope): description",
    };
  }

  const type = matched.groups?.type;
  if (!type || !ALLOWED_TYPES.has(type)) {
    return {
      valid: false,
      reason: `type 字段的值 "${type}" 不在允许的列表中 (${[...ALLOWED_TYPES].join(", ")})`,
    };
  }

  if (header.length > MAX_LINE_LENGTH) {
    return {
      valid: false,
      reason: `标题行超过 ${MAX_LINE_LENGTH} 字符限制 (当前 ${header.length} 字符)`,
    };
  }

  const longLines = body
    .split("\n")
    .filter((line) => line.length > MAX_LINE_LENGTH);
  if (longLines.length > 0) {
    return {
      valid: false,
      reason: `正文行超出 ${MAX_LINE_LENGTH} 字符限制: ${longLines.join(", ")}`,
    };
  }

  return { valid: true, value: message };
}
