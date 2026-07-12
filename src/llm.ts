import OpenAI from "openai";
import type { AppConfig } from "./config";

const SYSTEM_PROMPT = `你是一位擅长编写 Git 提交信息的专家。
根据提供的 Git diff，生成简洁且描述准确的提交信息。
遵循 Conventional Commits 格式：<type>(<scope>): <description>
类型包括：feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
标题行控制在 72 个字符以内。
如果有重要变更，在空行后添加更详细的正文说明。
只回复提交信息本身，不要添加任何解释。`;

export async function generateCommitMessage(
  diff: string,
  config: AppConfig,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Please set it in .env or environment variables.",
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.endpoint,
  });

  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: config.llm.temperature,
    max_tokens: config.llm.max_tokens,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是 Git diff 内容：\n\n${diff}`,
      },
    ],
  });

  const message = response.choices[0]?.message?.content?.trim();
  if (!message) {
    throw new Error("LLM returned an empty commit message.");
  }
  return message;
}
