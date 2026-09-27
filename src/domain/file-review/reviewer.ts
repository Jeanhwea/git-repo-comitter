import type OpenAI from "openai";

import type { AppConfig } from "@/infra/config/types";
import { type ValidationOutcome, callWithValidation } from "@/infra/llm/retry";
import { createLogger } from "@/utils/logger";

import {
  REVIEW_SYSTEM_PROMPT,
  reviewRepairHint,
  wrapNewFiles,
} from "./prompts";

const log = createLogger("review");

export interface ReviewResult {
  shouldCommit: boolean;
  suspiciousFiles: string[];
  reason: string;
}

/**
 * 审查结果校验。
 * 校验项与 REVIEW_SYSTEM_PROMPT 的 rules / output 节一一对应（JSON 合法、字段类型、reason 长度），
 * 避免规则写了却没人校验、坏结果直接流到提交闸门。
 */
const REASON_MAX_LENGTH = 80;

function reviewValidator(content: string): ValidationOutcome<ReviewResult> {
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

export async function reviewNewFiles(
  newFileContents: { path: string; content: string }[],
  config: AppConfig,
): Promise<ReviewResult> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: wrapNewFiles(newFileContents) },
  ];

  log.debug(`开始审查 ${newFileContents.length} 个新增文件`);
  const result = await callWithValidation<ReviewResult>(config, messages, {
    label: "审查结果",
    temperatureOverride: 0,
    validate: reviewValidator,
    repairHint: reviewRepairHint,
  });
  log.trace("审查结论", {
    shouldCommit: result.shouldCommit,
    suspiciousFiles: result.suspiciousFiles,
    reason: result.reason,
  });
  return result;
}
