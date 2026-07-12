import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import YAML from "yaml";
import dotenv from "dotenv";


const USER_CONFIG_PATH = resolve(homedir(), ".grc", "config.json");
dotenv.config();

export interface LLMConfig {
  model: string;
  temperature: number;
  max_input_tokens: number;
  max_output_tokens: number;
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
    model: "deepseek-v4-flash",
    temperature: 0.7,
  max_input_tokens: 128000,
  max_output_tokens: 16384,
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
export function loadUserConfig(): Partial<AppConfig> {
  try {
    if (!existsSync(USER_CONFIG_PATH)) return {};
    const raw = readFileSync(USER_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      llm: parsed.llm ? { ...parsed.llm } : undefined,
      style: parsed.style ? { ...parsed.style } : undefined,
      git: parsed.git ? { ...parsed.git } : undefined,
    };
  } catch {
    return {};
  }
}

export function saveUserConfig(config: Partial<AppConfig>): void {
  const dir = resolve(homedir(), ".grc");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function loadConfig(configPath?: string): AppConfig {
  const configFile =
    configPath ||
    [".git-repo-committer.yaml", ".git-repo-committer.yml", "config.yaml"].find(
      (f) => existsSync(resolve(process.cwd(), f)),
    );

  let fileConfig: Partial<AppConfig> = {};

  if (configFile) {
    const content = readFileSync(resolve(process.cwd(), configFile), "utf-8");
    fileConfig = YAML.parse(content);
  }

  const userConfig = loadUserConfig();

  const envModel = process.env.LLM_MODEL;
  const envApiKey = process.env.LLM_API_KEY;
  const envEndpoint = process.env.LLM_ENDPOINT;

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...userConfig,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...(fileConfig.llm || {}),
      ...(userConfig.llm || {}),
      ...(envModel ? { model: envModel } : {}),
    },
    style: { ...DEFAULT_CONFIG.style, ...(fileConfig.style || {}), ...(userConfig.style || {}) },
    git: { ...DEFAULT_CONFIG.git, ...(fileConfig.git || {}), ...(userConfig.git || {}) },
    apiKey: envApiKey || userConfig.apiKey || fileConfig.apiKey || "",
    endpoint: envEndpoint || userConfig.endpoint || fileConfig.endpoint || DEFAULT_CONFIG.endpoint,
  };
}
