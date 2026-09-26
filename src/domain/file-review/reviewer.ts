import type OpenAI from "openai";

import type { AppConfig } from "@/infra/config/types";
import { type ValidationOutcome, callWithValidation } from "@/infra/llm/retry";

import {
  REVIEW_SYSTEM_PROMPT,
  reviewRepairHint,
  wrapNewFiles,
} from "./prompts";

export interface ReviewResult {
  shouldCommit: boolean;
  suspiciousFiles: string[];
  reason: string;
}

function reviewValidator(content: string): ValidationOutcome<ReviewResult> {
  try {
    const result = JSON.parse(content);
    return { valid: true, value: result as ReviewResult };
  } catch (err) {
    return {
      valid: false,
      reason: `JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function reviewNewFiles(
  newFileContents: { path: string; content: string }[],
  config: AppConfig,
): Promise<ReviewResult> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: wrapNewFiles(newFileContents) },
  ];

  return callWithValidation<ReviewResult>(config, messages, {
    label: "审查结果",
    temperatureOverride: 0,
    validate: reviewValidator,
    repairHint: reviewRepairHint,
  });
}
