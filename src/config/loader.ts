import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

import { type AppConfig, DEFAULT_CONFIG } from "./types";

const USER_CONFIG_PATH = resolve(homedir(), ".grc", "config.json");

export function loadUserConfig(): Partial<AppConfig> {
  if (!existsSync(USER_CONFIG_PATH)) return {};
  try {
    const raw = readFileSync(USER_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      llm: parsed.llm ? { ...parsed.llm } : undefined,
    };
  } catch (err) {
    console.warn(
      `警告：解析 ${USER_CONFIG_PATH} 失败，已忽略用户配置。原因：${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

export function saveUserConfig(config: Partial<AppConfig>): void {
  const dir = resolve(homedir(), ".grc");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function envNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function loadConfig(): AppConfig {
  const userConfig = loadUserConfig();
  const env = process.env;

  const envLlmOverrides: Partial<AppConfig["llm"]> = {};
  if (env.LLM_MODEL) envLlmOverrides.model = env.LLM_MODEL;
  const temperature = envNumber(env.LLM_TEMPERATURE);
  if (temperature !== undefined) envLlmOverrides.temperature = temperature;
  const maxInputTokens = envNumber(env.LLM_MAX_INPUT_TOKENS);
  if (maxInputTokens !== undefined)
    envLlmOverrides.maxInputTokens = maxInputTokens;
  const maxOutputTokens = envNumber(env.LLM_MAX_OUTPUT_TOKENS);
  if (maxOutputTokens !== undefined)
    envLlmOverrides.maxOutputTokens = maxOutputTokens;

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...(userConfig.llm || {}),
      ...envLlmOverrides,
    },
    apiKey: env.LLM_API_KEY || userConfig.apiKey || "",
    endpoint: env.LLM_ENDPOINT || userConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
