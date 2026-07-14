import OpenAI from "openai";

import type { AppConfig } from "../config/types";
import { extractContent } from "./response";

const REVIEW_SYSTEM_PROMPT = `你是一个 Git 提交审查助手。你的任务是检查 Git 新增的文件，判断这些文件是否应该被提交。

请检查以下新增的文件列表和内容，判断是否存在不当提交的情况：
1. 编译产物或生成文件（如 node_modules/, dist/, build/ 等）
2. 依赖锁定文件（如 package-lock.json, yarn.lock 等）
3. 临时文件、日志文件、系统文件
4. 涉及敏感信息（密码、密钥、Token、内网地址等）的文件
5. 其他不应提交到 Git 仓库的文件

请只回复 JSON 格式，不要添加任何其他解释：
{
  "shouldCommit": boolean,    // 是否应该提交这些文件
  "suspiciousFiles": [        // 可疑的文件列表（路径）
    "path/to/file"
  ],
  "reason": "string"          // 判断理由
}`;

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
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.endpoint,
  });

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
