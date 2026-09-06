import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { createInterface } from "readline/promises";

import { type AppConfig, type LLMConfig } from "./types";

const USER_CONFIG_PATH = resolve(homedir(), ".grc", "config.json");

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    model: "deepseek-v4-flash",
    temperature: 0.7,
    maxInputTokens: 262144,
    maxOutputTokens: 8192,
  },
  apiKey: "",
  endpoint: "https://api.openai.com/v1",
};

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

async function clampLlmConfig(
  userLlm: Partial<LLMConfig> | undefined,
): Promise<LLMConfig> {
  const clamped = { ...DEFAULT_CONFIG.llm, ...(userLlm || {}) };

  if (
    userLlm?.maxOutputTokens != null &&
    userLlm.maxOutputTokens > DEFAULT_CONFIG.llm.maxOutputTokens
  ) {
    console.warn(
      `\n⚠️  警告：配置中的 maxOutputTokens (${userLlm.maxOutputTokens}) 超过了当前模型的上限 (${DEFAULT_CONFIG.llm.maxOutputTokens})。`,
    );

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = (
      await rl.question(
        `  是否将配置文件的 maxOutputTokens 修复为 ${DEFAULT_CONFIG.llm.maxOutputTokens}？(Y/n): `,
      )
    )
      .trim()
      .toLowerCase();
    rl.close();

    if (answer === "" || answer === "y" || answer === "yes") {
      const userConfig = loadUserConfig();
      saveUserConfig({
        ...userConfig,
        llm: {
          ...DEFAULT_CONFIG.llm,
          ...(userConfig.llm || {}),
          maxOutputTokens: DEFAULT_CONFIG.llm.maxOutputTokens,
        },
      });
      console.log(
        `  ✅ 已修复，maxOutputTokens 已设为 ${DEFAULT_CONFIG.llm.maxOutputTokens}。`,
      );
    } else {
      console.log(
        `  ℹ️  跳过修复，本次仍取较小值 ${DEFAULT_CONFIG.llm.maxOutputTokens}。`,
      );
    }

    clamped.maxOutputTokens = DEFAULT_CONFIG.llm.maxOutputTokens;
  }

  if (
    userLlm?.maxInputTokens != null &&
    userLlm.maxInputTokens > DEFAULT_CONFIG.llm.maxInputTokens
  ) {
    console.warn(
      `\n⚠️  警告：配置中的 maxInputTokens (${userLlm.maxInputTokens}) 超过了当前模型的上限 (${DEFAULT_CONFIG.llm.maxInputTokens})，将自动取较小值 ${DEFAULT_CONFIG.llm.maxInputTokens}。`,
    );
    clamped.maxInputTokens = DEFAULT_CONFIG.llm.maxInputTokens;
  }

  return clamped;
}

export async function loadConfig(): Promise<AppConfig> {
  const userConfig = loadUserConfig();

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    llm: await clampLlmConfig(userConfig.llm),
    apiKey: userConfig.apiKey || "",
    endpoint: userConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
