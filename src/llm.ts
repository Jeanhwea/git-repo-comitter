import OpenAI from "openai";
import type { AppConfig } from "./config";

const SYSTEM_PROMPT = `You are an expert at writing Git commit messages.
Based on the provided Git diff, generate a concise and descriptive commit message.
Follow the Conventional Commits format: <type>(<scope>): <description>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
Keep the message under 72 characters for the subject line.
If there are significant changes, add a blank line followed by a more detailed body.
Respond with ONLY the commit message, no explanation.`;

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
        content: `Here is the Git diff:\n\n${diff}`,
      },
    ],
  });

  const message = response.choices[0]?.message?.content?.trim();
  if (!message) {
    throw new Error("LLM returned an empty commit message.");
  }
  return message;
}
