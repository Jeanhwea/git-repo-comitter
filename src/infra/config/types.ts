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
