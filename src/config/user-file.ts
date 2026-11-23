/**
 * 配置层 —— 用户配置文件读写（Node 专有，F07）。
 *
 * fs / os / path 与文件 IO 一并下沉到本模块，使 loader.ts 保持纯函数、
 * 可在浏览器端复用（浏览器入口不导入本模块）。
 *
 * 依赖方向：本模块属 config 层，仅依赖 shared（同层规则），不依赖其他。
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { resolve } from "path";

import { createLogger } from "@/shared/logger";

import type { LLMConfig, UserConfig } from "./types";

const log = createLogger("config");

/** 配置目录 ~/.grc，配置文件位于其下的 config.json。 */
const CONFIG_DIR = resolve(homedir(), ".grc");
const USER_CONFIG_PATH = resolve(CONFIG_DIR, "config.json");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 读取用户配置文件 ~/.grc/config.json；文件不存在或解析失败时返回空配置。
 *
 * 解析异常只记 debug 日志：库调用方不应看到意外输出，需要提示的 CLI 可自行开日志级别。
 * 配置文件含 API Key，权限过宽时给出告警（Windows 的 mode 语义不同，跳过检查）。
 */
export function loadUserConfigFile(): UserConfig {
  if (!existsSync(USER_CONFIG_PATH)) return {};
  if (process.platform !== "win32") {
    try {
      const mode = statSync(USER_CONFIG_PATH).mode & 0o777;
      if (mode & 0o077) {
        log.warn(
          `配置文件权限过宽（${mode.toString(8)}），API Key 可能被其他用户读取。请执行 chmod 600 ${USER_CONFIG_PATH}`,
        );
      }
    } catch {
      // 权限探测失败不影响配置读取
    }
  }
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
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
    // 文件已存在时 mode 参数不生效，显式收紧旧文件的权限。
    try {
      chmodSync(USER_CONFIG_PATH, 0o600);
      chmodSync(CONFIG_DIR, 0o700);
    } catch {
      // 收紧失败不阻断保存；下次读取时会告警提示用户处理
    }
  }
}
