/**
 * 配置层 —— 默认值、加载、校验收敛（纯函数，F07）。
 *
 * 文件读写（fs / os / path）已下沉到 config/user-file.ts，使本模块零环境依赖，
 * 可在浏览器端复用（resolveConfig / loadDefaultConfig 被浏览器入口直接导出）。
 *
 * F05：抽库后配置必须可注入，且默认不得产生「读全局文件 + 终端提问」的副作用：
 * - `resolveConfig()`      纯函数：默认值 + 覆盖值，静默收敛，不读写文件、不交互；
 * - `clampLlm()`           按模型上限收敛，只计算不告警，供调用方决定如何提示。
 *
 * 架构 A5：配置层只做「数据」，不含终端交互、不直接 console 输出。
 * CLI 的告警与交互式修复上移到 app/config/load.ts。
 */
import type { AppConfig, LLMConfig, UserConfig } from "./types";

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
