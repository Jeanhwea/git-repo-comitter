// ── types ──────────────────────────────────────────────────────────────
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ── rules ──────────────────────────────────────────────────────────────
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

export function validateCommitMessage(message: string): ValidationResult {
  const firstBlank = message.indexOf("\n\n");
  const header =
    firstBlank === -1 ? message.trim() : message.slice(0, firstBlank).trim();
  const body = firstBlank === -1 ? "" : message.slice(firstBlank + 2).trim();

  // Header must match conventional commit: type(scope)!: description
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

  const { type, description } = match.groups!;

  // type must be one of the allowed types
  if (!ALLOWED_TYPES.includes(type as AllowedType)) {
    return {
      valid: false,
      reason: `type 字段的值 "${type}" 不在允许的列表中 (${ALLOWED_TYPES.join(", ")})`,
    };
  }

  // header length check
  if (header.length > 72) {
    return {
      valid: false,
      reason: `标题行超过 72 字符限制 (当前 ${header.length} 字符)`,
    };
  }

  // body checks
  if (body) {
    // body must be preceded by a blank line
    if (firstBlank === -1) {
      return {
        valid: false,
        reason: "正文前需空一行",
      };
    }
    // each body line must be ≤ 72 chars
    const lines = body.split("\n");
    const longLines = lines.filter((line) => line.length > 72);
    if (longLines.length > 0) {
      return {
        valid: false,
        reason: `正文行超出 72 字符限制: ${longLines.join(", ")}`,
      };
    }
  }

  return { valid: true };
}
