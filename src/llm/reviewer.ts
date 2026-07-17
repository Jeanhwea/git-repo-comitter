import type { AppConfig } from "../config/types";
import { singleTurn } from "./client";
import { REVIEW_SYSTEM_PROMPT } from "./prompts";

export interface ReviewResult {
  shouldCommit: boolean;
  suspiciousFiles: string[];
  reason: string;
}

export async function reviewNewFiles(
  newFileContents: { path: string; content: string }[],
  config: AppConfig,
): Promise<ReviewResult> {
  const fileList = newFileContents
    .map((f) => `路径: ${f.path}\n内容:\n${f.content}`)
    .join("\n\n---\n\n");

  const content = await singleTurn(
    config,
    REVIEW_SYSTEM_PROMPT,
    `请审查以下新增文件：\n\n${fileList}`,
    0,
  );
  if (!content) {
    throw new Error("LLM 在审查新增文件时返回了空内容。");
  }

  try {
    const result = JSON.parse(content) as ReviewResult;
    return result;
  } catch {
    throw new Error(`LLM 返回的审查结果不是有效的 JSON:\n${content}`);
  }
}
