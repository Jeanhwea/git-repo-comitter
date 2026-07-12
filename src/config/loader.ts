import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import { DEFAULT_CONFIG, type AppConfig } from "./types";

const USER_CONFIG_PATH = resolve(homedir(), ".grc", "config.json");

export function loadUserConfig(): Partial<AppConfig> {
  try {
    if (!existsSync(USER_CONFIG_PATH)) return {};
    const raw = readFileSync(USER_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      llm: parsed.llm ? { ...parsed.llm } : undefined,
    };
  } catch {
    return {};
  }
}

export function saveUserConfig(config: Partial<AppConfig>): void {
  const dir = resolve(homedir(), ".grc");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function loadConfig(): AppConfig {
  const userConfig = loadUserConfig();

  const envModel = process.env.LLM_MODEL;
  const envApiKey = process.env.LLM_API_KEY;
  const envEndpoint = process.env.LLM_ENDPOINT;

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...(userConfig.llm || {}),
      ...(envModel ? { model: envModel } : {}),
    },
    apiKey: envApiKey || userConfig.apiKey || "",
    endpoint: envEndpoint || userConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
