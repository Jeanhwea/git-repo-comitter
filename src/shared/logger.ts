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

let currentLevel: LogLevel = normalizeLevel(
  typeof process !== "undefined" ? process.env?.GRC_LOG_LEVEL : undefined,
);

/**
 * 运行时调整日志级别（CLI 选项在解析后调用）。
 * @param level - 目标日志级别，低于它的记录不会被输出。
 */
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

/** 一条日志的完整上下文，供自定义输出槽消费。 */
export interface LogRecord {
  level: LogLevel;
  namespace: string;
  message: string;
  args: unknown[];
  /** 已格式化好的单行文本，等价于默认 console 输出的内容。 */
  text: string;
}

/**
 * 日志输出槽。
 * F05：库被其他代码调用时，调用方常需接管或静默诊断日志，
 * 因此默认 console 行为可被注入的槽替换（传 null 即恢复默认）。
 */
export type LogSink = (record: LogRecord) => void;

let currentSink: LogSink | null = null;

/**
 * 注入日志输出槽；传 null 恢复默认 console 行为。
 * @param sink - 目标输出槽；传 null 表示恢复默认 console 行为。
 */
export function setLogSink(sink: LogSink | null): void {
  currentSink = sink;
}

/**
 * 创建一个带命名空间（namespace）的日志器。
 * 命名空间用于在追溯日志时区分来源，例如 commit / llm / batch / git。
 * @param namespace - 日志来源标识，会作为前缀出现在每条日志里。
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
    if (currentSink) {
      currentSink({ level, namespace, message: msg, args, text });
      return;
    }
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
