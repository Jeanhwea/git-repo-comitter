import lint from "@commitlint/lint";
import type {
  RuleConfigCondition,
  RuleConfigSeverity,
  RuleConfigTuple,
} from "@commitlint/types";

type QualifiedRules = Partial<
  Record<
    string,
    | [2 | 0, RuleConfigCondition]
    | [2 | 0, RuleConfigCondition, string[] | number]
  >
>;

const COMMITLINT_RULES: QualifiedRules = {
  "type-enum": [
    2,
    "always",
    [
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
    ],
  ],
  "header-max-length": [2, "always", 72],
  "body-leading-blank": [2, "always"],
  "body-max-line-length": [2, "always", 72],
};
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export async function validateConventionalCommit(
  message: string,
): Promise<ValidationResult> {
  const report = await lint(message, COMMITLINT_RULES);
  if (report.valid) {
    return { valid: true };
  }
  const errorMessages = report.errors
    .map((e) => e.name + ": " + e.message)
    .join("; ");
  return { valid: false, reason: errorMessages };
}
