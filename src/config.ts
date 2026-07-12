import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import YAML from "yaml";
import dotenv from "dotenv";

dotenv.config();

export interface LLMConfig {
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface StyleConfig {
  language: string;
  template: string;
}

export interface GitConfig {
  repoPath: string;
}

export interface AppConfig {
  llm: LLMConfig;
  style: StyleConfig;
  git: GitConfig;
  apiKey: string;
  endpoint: string;
}

const DEFAULT_CONFIG: AppConfig = {
  llm: {
    model: "gpt-4",
    temperature: 0.7,
    max_tokens: 256,
  },
  style: {
    language: "zh-CN",
    template: "conventional",
  },
  git: {
    repoPath: ".",
  },
  apiKey: "",
  endpoint: "https://api.openai.com/v1",
};

export function loadConfig(configPath?: string): AppConfig {
  const configFile =
    configPath ||
    [
      ".git-repo-committer.yaml",
      ".git-repo-committer.yml",
      "config.yaml",
    ].find((f) => existsSync(resolve(process.cwd(), f)));

  let fileConfig: Partial<AppConfig> = {};

  if (configFile) {
    const content = readFileSync(resolve(process.cwd(), configFile), "utf-8");
    fileConfig = YAML.parse(content);
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    llm: { ...DEFAULT_CONFIG.llm, ...(fileConfig.llm || {}) },
    style: { ...DEFAULT_CONFIG.style, ...(fileConfig.style || {}) },
    git: { ...DEFAULT_CONFIG.git, ...(fileConfig.git || {}) },
    apiKey: process.env.LLM_API_KEY || fileConfig.apiKey || "",
    endpoint: process.env.LLM_ENDPOINT || fileConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
