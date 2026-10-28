/**
 * 配置层 —— 默认值、加载、校验收敛与持久化。
 *
 * 由 infra/config 迁出（I06 的 P3）；交互问答改用 shared/input 的 question()，
 * 删除原先内联的 createInterface 实现（I06 的 P7）。
 *
 * F05：抽库后配置必须可注入，且默认不得产生「读全局文件 + 终端提问」的副作用：
 * - `resolveConfig()`      纯函数：默认值 + 覆盖值，静默收敛，不读写文件、不交互；
 * - `loadUserConfigFile()` 读取 ~/.grc/config.json，供 CLI 或主动选择的调用方使用；
 * - `loadConfig()`         CLI 便捷入口：给显式配置时走 resolveConfig，否则读文件并允许交互修复。
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

/** 读取用户配置文件 ~/.grc/config.json；文件不存在或解析失败时返回空配置。 */
export function loadUserConfigFile(): UserConfig {
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

/** 返回一份内置默认配置的深拷贝，供调用方在其基础上覆盖字段。 */
export function loadDefaultConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    llm: { ...DEFAULT_CONFIG.llm },
  };
}

interface ExceededToken {
  userValue: number;
  limit: number;
}

interface LlmClampResult {
  llm: LLMConfig;
  /** maxOutputTokens 超限时给出（供 CLI 询问是否写回文件），否则为 null。 */
  outputExceeded: ExceededToken | null;
  /** maxInputTokens 超限时给出（供 CLI 告警），否则为 null。 */
  inputExceeded: ExceededToken | null;
}

/**
 * 按模型上限收敛 LLM 配置。
 * 只计算、不产生副作用：是否告警或询问由调用方决定，
 * 因此库路径（resolveConfig）可完全静默，CLI 路径保留原有交互。
 */
function clampLlm(userLlm: Partial<LLMConfig> | undefined): LlmClampResult {
  const effective = { ...DEFAULT_CONFIG.llm, ...(userLlm || {}) };
  const { maxInputTokens, maxOutputTokens } = DEFAULT_CONFIG.llm;

  let outputExceeded: ExceededToken | null = null;
  let inputExceeded: ExceededToken | null = null;

  const userOutput = userLlm?.maxOutputTokens;
  if (userOutput != null && userOutput > maxOutputTokens) {
    outputExceeded = { userValue: userOutput, limit: maxOutputTokens };
    effective.maxOutputTokens = maxOutputTokens;
  }

  const userInput = userLlm?.maxInputTokens;
  if (userInput != null && userInput > maxInputTokens) {
    inputExceeded = { userValue: userInput, limit: maxInputTokens };
    effective.maxInputTokens = maxInputTokens;
  }

  return { llm: effective, outputExceeded, inputExceeded };
}

/**
 * 纯函数式配置解析：内置默认值 + 覆盖值 → 完整 AppConfig。
 *
 * 不读写文件、不触发终端交互，超限时静默取较小值。
 * 这是库调用方组装配置的标准入口。
 */
export function resolveConfig(user?: UserConfig): AppConfig {
  const { llm } = clampLlm(user?.llm);
  return {
    ...DEFAULT_CONFIG,
    ...(user || {}),
    llm,
    apiKey: user?.apiKey || "",
    endpoint: user?.endpoint || DEFAULT_CONFIG.endpoint,
  };
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

  const userConfig = loadUserConfigFile();
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

export interface LoadConfigOptions {
  /**
   * 显式配置。给出时不再读取配置文件、不触发任何交互，
   * 等价于 resolveConfig(config)，供「配置来自别处」的场景使用。
   */
  config?: UserConfig;
  /** 是否允许交互式修复超限配置，默认 true（仅 CLI 场景有实际意义）。 */
  interactive?: boolean;
}

/**
 * CLI 便捷入口：无显式配置时读取 ~/.grc/config.json 并允许交互修复。
 * 库调用方应使用 resolveConfig / loadDefaultConfig，避免隐式全局副作用。
 */
export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<AppConfig> {
  if (options.config) return resolveConfig(options.config);

  const userConfig = loadUserConfigFile();
  const { llm, outputExceeded, inputExceeded } = clampLlm(userConfig.llm);

  if (inputExceeded) {
    console.warn(
      `\n⚠️  警告：配置中的 maxInputTokens (${inputExceeded.userValue}) 超过了当前模型的上限 (${inputExceeded.limit})，将自动取较小值 ${inputExceeded.limit}。`,
    );
  }
  if (outputExceeded && (options.interactive ?? true)) {
    await offerRepair(outputExceeded.userValue, outputExceeded.limit);
  }

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    llm,
    apiKey: userConfig.apiKey || "",
    endpoint: userConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
