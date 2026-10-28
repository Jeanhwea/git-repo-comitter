/**
 * 配置层 —— 默认值、加载、校验收敛与持久化。
 *
 * 由 infra/config 迁出（I06 的 P3）；交互问答改用 shared/input 的 question()，
 * 删除原先内联的 createInterface 实现（I06 的 P7）。
 *
 * F05：抽库后配置必须可注入，且默认不得产生「读全局文件 + 终端提问」的副作用：
 * - `resolveConfig()`      纯函数：默认值 + 覆盖值，静默收敛，不读写文件、不交互；
 * - `loadUserConfigFile()` 读取 ~/.grc/config.json，供 CLI 或主动选择的调用方使用；
 * - `clampLlm()`           按模型上限收敛，只计算不告警，供调用方决定如何提示。
 *
 * 架构 A5：配置层只做「数据 + 文件」，不含终端交互、不直接 console 输出。
 * CLI 的告警与交互式修复上移到 app/config/load.ts。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

import { createLogger } from "@/shared/logger";

import { type AppConfig, type LLMConfig, type UserConfig } from "./types";

const log = createLogger("config");

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

/**
 * 读取用户配置文件 ~/.grc/config.json；文件不存在或解析失败时返回空配置。
 *
 * 解析异常只记 debug 日志：库调用方不应看到意外输出，需要提示的 CLI 可自行开日志级别。
 */
export function loadUserConfigFile(): UserConfig {
  if (!existsSync(USER_CONFIG_PATH)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(USER_CONFIG_PATH, "utf-8"));
    if (!isPlainObject(parsed)) {
      log.debug(`${USER_CONFIG_PATH} 的内容不是 JSON 对象，已忽略用户配置。`);
      return {};
    }
    return {
      ...(parsed as UserConfig),
      llm: isPlainObject(parsed.llm)
        ? { ...(parsed.llm as Partial<LLMConfig>) }
        : undefined,
    };
  } catch (err) {
    log.debug(
      `解析 ${USER_CONFIG_PATH} 失败，已忽略用户配置。原因：${err instanceof Error ? err.message : String(err)}`,
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

/** 一项超限配置：用户实际写出的数值，与模型允许的上限值。 */
export interface ExceededToken {
  userValue: number;
  limit: number;
}

export interface LlmClampResult {
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
 * @param userLlm - 用户配置的 LLM 片段，缺省时按内置默认值收敛。
 */
export function clampLlm(
  userLlm: Partial<LLMConfig> | undefined,
): LlmClampResult {
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
 * @param user - 用户覆盖值，缺省时全部字段回落到内置默认值。
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
