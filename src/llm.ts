import OpenAI from "openai";
import type { AppConfig } from "./config";

const SYSTEM_PROMPT = `你是一位擅长编写 Git 提交信息的专家。根据提供的 Git diff，生成简洁且描述准确的提交信息。

格式规范：
- 遵循 Conventional Commits：<type>(<scope>): <description>
- type 可选值：feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- 标题行控制在 72 字符以内
- 正文使用无序列表分条陈述，每条以 "- " 开头
- 如变更较简单，可省略正文，仅保留标题行
- 提交的信息必须符合 Conventional Commits 格式
- 描述语言使用中文，避免使用英文。

示例：
1. 仅标题行：
   fix(auth): 修复登录重定向丢失 query 参数的问题

2. 标题 + 正文：
   feat(api): 新增用户批量导入接口
   - 支持 CSV 和 JSON 两种文件格式
   - 单次最多处理 1000 条记录
   - 导入失败时返回逐条错误详情

3. 多处关联变更：
   refactor(storage): 统一缓存键的生成逻辑
   - 抽取 keyBuilder 工具函数替代各处硬编码
   - 迁移 session 和 permission 模块至新接口
   - 移除已废弃的 getCacheKey 方法

只回复提交信息本身，不要添加任何解释。`;

function extractContent(response: any): string {
  const data = typeof response === "string" ? JSON.parse(response) : response;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();
  }
  return "";
}

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
    max_tokens: config.llm.max_output_tokens,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是 Git diff 内容：\n\n${diff}`,
      },
    ],
  });

  const message = extractContent(response);
  if (!message) {
    throw new Error(
      `LLM returned an empty commit message. Response: ${JSON.stringify(response)}`,
    );
  }
  return message;
}
