/**
 * 配置层 —— 配置类型定义。
 *
 * 原位于 infra/config，现独立成层（I06 的 P3）：配置不是外部系统访问，
 * 而是贯穿各层的基础输入，单独成层后 app/domain/infra 均可正向依赖。
 */
export interface LLMConfig {
  model: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export interface AppConfig {
  llm: LLMConfig;
  apiKey: string;
  endpoint: string;
  /** 单次 LLM 请求超时（毫秒）；缺省取 shared/limits 的默认值。 */
  timeoutMs?: number;
  /** SDK 内部重试次数；默认 0，避免与项目自己的限流退避叠加成双重重试。 */
  maxRetries?: number;
}

/**
 * 配置文件 ~/.grc/config.json 的形状：顶层字段均可缺省，llm 内部字段亦可缺省，
 * 缺失部分在加载时由默认值补齐。
 */
export interface UserConfig {
  apiKey?: string;
  endpoint?: string;
  llm?: Partial<LLMConfig>;
  timeoutMs?: number;
  maxRetries?: number;
}
