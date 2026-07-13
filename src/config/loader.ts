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

export function loadConfig(): AppConfig {
  const userConfig = loadUserConfig();

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...(userConfig.llm || {}),
    },
    apiKey: userConfig.apiKey || "",
    endpoint: userConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
