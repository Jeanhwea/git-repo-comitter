export interface LLMConfig {
  model: string;
  temperature: number;
  max_input_tokens: number;
  max_output_tokens: number;
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
    max_input_tokens: 262144,
    max_output_tokens: 16384,
  },
  apiKey: "",
  endpoint: "https://api.openai.com/v1",
};
