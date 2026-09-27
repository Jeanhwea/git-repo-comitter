/**
 * 轻量级分级日志器（公共层）。
 *
 * 设计目标：在不改变默认输出的前提下，提供可开关的「进度追溯」能力。
 * - 默认日志级别为 info，但业务代码中只新增 debug/trace 级别的调用，
 *   因此默认情况下这些日志不会打印，原有 console.log 的用户提示保持不变。
 * - 通过 CLI 的 --verbose / --debug / --trace 选项，或环境变量 GRC_LOG_LEVEL
 *   开启更详细的进度追踪。
 *
 * 时钟格式化改为复用 shared/time 的 formatClockTime（I06 的 P8），避免重复实现。
 */
import { formatClockTime } from "./time";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

function normalizeLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "").trim().toLowerCase();
  if (value in LEVEL_WEIGHT) return value as LogLevel;
  return "info";
}

let currentLevel: LogLevel = normalizeLevel(process.env.GRC_LOG_LEVEL);

/** 运行时调整日志级别（CLI 选项在解析后调用）。 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export interface Logger {
  trace: (msg: string, ...args: unknown[]) => void;
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
}

/**
 * 创建一个带命名空间（namespace）的日志器。
 * 命名空间用于在追溯日志时区分来源，例如 commit / llm / batch / git。
 */
export function createLogger(namespace: string): Logger {
  const prefix = (level: LogLevel): string => {
    const tag = level.toUpperCase().padEnd(5);
    return `${formatClockTime()} ${tag} [${namespace}]`;
  };

  const emit = (level: LogLevel, msg: string, args: unknown[]): void => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentLevel]) return;
    const line = `${prefix(level)} ${msg}`;
    const text =
      args.length > 0 ? `${line} ${args.map(formatArg).join(" ")}` : line;
    if (level === "error" || level === "warn") {
      console.error(text);
    } else {
      console.log(text);
    }
  };

  return {
    trace: (msg, ...args) => emit("trace", msg, args),
    debug: (msg, ...args) => emit("debug", msg, args),
    info: (msg, ...args) => emit("info", msg, args),
    warn: (msg, ...args) => emit("warn", msg, args),
    error: (msg, ...args) => emit("error", msg, args),
  };
}
