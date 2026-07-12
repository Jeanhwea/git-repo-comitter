import { loadUserConfig, saveUserConfig } from "../config/loader";
import { question } from "../config/util";

export async function runInit(): Promise<void> {
  console.log("LLM 配置初始化\n");

  const existing = loadUserConfig();

  const endpoint =
    (
      await question(
        `大模型链接 (API 地址) [${existing.endpoint || "https://api.openai.com/v1"}]: `,
      )
    ).trim() ||
    existing.endpoint ||
    "https://api.openai.com/v1";

  const model =
    (
      await question(
        `模型名称 [${existing.llm?.model || "deepseek-v4-flash"}]: `,
      )
    ).trim() ||
    existing.llm?.model ||
    "deepseek-v4-flash";

  const apiKey =
    (
      await question(`API Key [${existing.apiKey ? "***" : "(必填)"}]: `)
    ).trim() || existing.apiKey;

  if (!apiKey) {
    console.error("\n错误：API Key 不能为空。");
    process.exit(1);
  }

  saveUserConfig({
    apiKey,
    endpoint,
    llm: {
      model,
      temperature: 0.7,
      maxInputTokens: 262144,
      maxOutputTokens: 16384,
    },
  });
  console.log("\n配置已保存到 ~/.grc/config.json");
}
