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
}
