import type { AppConfig } from "../config/types";
import { createClient } from "./client";
import { REVIEW_SYSTEM_PROMPT } from "./prompts";
import { extractContent } from "./response";

export interface ReviewResult {
  shouldCommit: boolean;
  suspiciousFiles: string[];
  reason: string;
}

/**
 * 使用大模型审查新增文件是否应该提交
 */
export async function reviewNewFiles(
  newFileContents: { path: string; content: string }[],
  config: AppConfig,
): Promise<ReviewResult> {
  const client = createClient(config);

  const fileList = newFileContents
    .map((f) => `路径: ${f.path}\n内容:\n${f.content}`)
    .join("\n\n---\n\n");

  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: 0,
    max_tokens: config.llm.maxOutputTokens,
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content: `请审查以下新增文件：\n\n${fileList}`,
      },
    ],
  });

  const content = extractContent(response);
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
