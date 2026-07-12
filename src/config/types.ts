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

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    model: "deepseek-v4-flash",
    temperature: 0.7,
    maxInputTokens: 262144,
    maxOutputTokens: 16384,
  },
  apiKey: "",
  endpoint: "https://api.openai.com/v1",
};
