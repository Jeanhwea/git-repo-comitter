/**
 * 配置层 —— 默认值、加载、校验收敛与持久化。
 *
 * 由 infra/config 迁出（I06 的 P3）；交互问答改用 shared/input 的 question()，
 * 删除原先内联的 createInterface 实现（I06 的 P7）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

import { question } from "@/shared/input";

import { type AppConfig, type LLMConfig, type UserConfig } from "./types";

/** 配置目录 ~/.grc，配置文件位于其下的 config.json。 */
const CONFIG_DIR = resolve(homedir(), ".grc");
const USER_CONFIG_PATH = resolve(CONFIG_DIR, "config.json");

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function loadUserConfig(): UserConfig {
  if (!existsSync(USER_CONFIG_PATH)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(USER_CONFIG_PATH, "utf-8"));
    if (!isPlainObject(parsed)) {
      console.warn(
        `警告：${USER_CONFIG_PATH} 的内容不是 JSON 对象，已忽略用户配置。`,
      );
      return {};
    }
    return {
      ...(parsed as UserConfig),
      llm: isPlainObject(parsed.llm)
        ? { ...(parsed.llm as Partial<LLMConfig>) }
        : undefined,
    };
  } catch (err) {
    console.warn(
      `警告：解析 ${USER_CONFIG_PATH} 失败，已忽略用户配置。原因：${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

export function saveUserConfig(config: UserConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/** 交互询问是否把超限的 maxOutputTokens 写回配置文件；拒绝时本次仍取上限值。 */
async function offerRepair(userValue: number, limit: number): Promise<void> {
  console.warn(
    `\n⚠️  警告：配置中的 maxOutputTokens (${userValue}) 超过了当前模型的上限 (${limit})。`,
  );

  const answer = (
    await question(
      `  是否将配置文件的 maxOutputTokens 修复为 ${limit}？(Y/n): `,
    )
  )
    .trim()
    .toLowerCase();

  if (answer !== "" && answer !== "y" && answer !== "yes") {
    console.log(`  ℹ️  跳过修复，本次仍取较小值 ${limit}。`);
    return;
  }

  const userConfig = loadUserConfig();
  saveUserConfig({
    ...userConfig,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...(userConfig.llm || {}),
      maxOutputTokens: limit,
    },
  });
  console.log(`  ✅ 已修复，maxOutputTokens 已设为 ${limit}。`);
}

async function clampLlmConfig(
  userLlm: Partial<LLMConfig> | undefined,
): Promise<LLMConfig> {
  const effective = { ...DEFAULT_CONFIG.llm, ...(userLlm || {}) };
  const { maxInputTokens, maxOutputTokens } = DEFAULT_CONFIG.llm;

  const userOutput = userLlm?.maxOutputTokens;
  if (userOutput != null && userOutput > maxOutputTokens) {
    await offerRepair(userOutput, maxOutputTokens);
    effective.maxOutputTokens = maxOutputTokens;
  }

  const userInput = userLlm?.maxInputTokens;
  if (userInput != null && userInput > maxInputTokens) {
    console.warn(
      `\n⚠️  警告：配置中的 maxInputTokens (${userInput}) 超过了当前模型的上限 (${maxInputTokens})，将自动取较小值 ${maxInputTokens}。`,
    );
    effective.maxInputTokens = maxInputTokens;
  }

  return effective;
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
