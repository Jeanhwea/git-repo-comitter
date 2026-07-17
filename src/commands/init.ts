import { CliError } from "../cli/errors";
import { question } from "../cli/input";
import {
  DEFAULT_CONFIG,
  loadUserConfig,
  saveUserConfig,
} from "../config/loader";

export async function runInit(): Promise<void> {
  console.log("LLM 配置初始化\n");

  const existing = loadUserConfig();

  const endpoint =
    (
      await question(
        `大模型链接（API 地址）[${existing.endpoint || DEFAULT_CONFIG.endpoint}]: `,
      )
    ).trim() ||
    existing.endpoint ||
    DEFAULT_CONFIG.endpoint;

  const model =
    (
      await question(
        `模型名称 [${existing.llm?.model || DEFAULT_CONFIG.llm.model}]: `,
      )
    ).trim() ||
    existing.llm?.model ||
    DEFAULT_CONFIG.llm.model;

  const apiKey =
    (
      await question(`API Key [${existing.apiKey ? "***" : "（必填）"}]: `)
    ).trim() || existing.apiKey;

  if (!apiKey) {
    throw new CliError("API Key 不能为空。");
  }

  saveUserConfig({
    apiKey,
    endpoint,
    llm: {
      model,
      temperature: DEFAULT_CONFIG.llm.temperature,
      maxInputTokens: DEFAULT_CONFIG.llm.maxInputTokens,
      maxOutputTokens: DEFAULT_CONFIG.llm.maxOutputTokens,
    },
  });
  console.log("\n配置已保存到 ~/.grc/config.json");
}
