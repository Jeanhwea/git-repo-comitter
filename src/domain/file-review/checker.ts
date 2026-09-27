/**
 * 领域层 —— 文件审查结果校验。
 *
 * 与 commit-message/checker.ts 对称（I06 的 P6）：原先 reviewValidator 内嵌在
 * reviewer.ts 中与 LLM 调用混写，现独立成校验器，只负责「结果是否可用」。
 */
import type { ValidationOutcome } from "@/infra/llm/retry";

export interface ReviewResult {
  shouldCommit: boolean;
  suspiciousFiles: string[];
  reason: string;
}

/**
 * 校验项与 REVIEW_SYSTEM_PROMPT 的 rules / output 节一一对应
 * （JSON 合法、字段类型、reason 长度），避免坏结果直接流到提交闸门。
 */
const REASON_MAX_LENGTH = 80;

export function reviewValidator(
  content: string,
): ValidationOutcome<ReviewResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      valid: false,
      reason: `JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, reason: "审查结果必须是一个 JSON 对象" };
  }

  const { shouldCommit, suspiciousFiles, reason } = parsed as Record<
    string,
    unknown
  >;

  if (typeof shouldCommit !== "boolean") {
    return { valid: false, reason: "shouldCommit 必须是布尔值" };
  }

  if (
    !Array.isArray(suspiciousFiles) ||
    suspiciousFiles.some((f) => typeof f !== "string")
  ) {
    return { valid: false, reason: "suspiciousFiles 必须是字符串数组" };
  }

  if (typeof reason !== "string") {
    return { valid: false, reason: "reason 必须是字符串" };
  }

  if (reason.length > REASON_MAX_LENGTH) {
    return {
      valid: false,
      reason: `reason 超过 ${REASON_MAX_LENGTH} 字符限制 (当前 ${reason.length} 字符)`,
    };
  }

  return {
    valid: true,
    value: { shouldCommit, suspiciousFiles, reason },
  };
}
