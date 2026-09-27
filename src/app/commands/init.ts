/**
 * 应用层 —— init 命令：交互式写入 LLM 配置。
 */
import {
  DEFAULT_CONFIG,
  loadUserConfig,
  saveUserConfig,
} from "@/config/loader";
import { CliError } from "@/shared/errors";
import { question } from "@/shared/input";

/**
 * 带默认值的提问：括号内展示当前值（或占位提示），直接回车即沿用默认值。
 * hint 与 fallback 分开，便于敏感字段（如 API Key）展示掩码而沿用真实值。
 */
async function ask(
  label: string,
  hint: string,
  fallback: string,
): Promise<string> {
  const answer = (await question(`${label} [${hint}]: `)).trim();
  return answer || fallback;
}

export async function runInit(): Promise<void> {
  console.log("LLM 配置初始化\n");

  const existing = loadUserConfig();

  const defaultEndpoint = existing.endpoint || DEFAULT_CONFIG.endpoint;
  const defaultModel = existing.llm?.model || DEFAULT_CONFIG.llm.model;

  const endpoint = await ask(
    "大模型链接（API 地址）",
    defaultEndpoint,
    defaultEndpoint,
  );
  const model = await ask("模型名称", defaultModel, defaultModel);
  const apiKey = await ask(
    "API Key",
    existing.apiKey ? "***" : "（必填）",
    existing.apiKey ?? "",
  );

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
