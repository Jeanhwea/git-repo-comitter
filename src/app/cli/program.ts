/**
 * 应用层 —— CLI 入口。
 *
 * 负责命令注册、全局选项、日志级别与统一错误出口；业务流程委托给 commands/*。
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import { Command } from "commander";

import { runCommit } from "@/app/commands/commit";
import { runInit } from "@/app/commands/init";
import { CliError, GrcError, type GrcErrorCode } from "@/shared/errors";
import { type LogLevel, setLogLevel } from "@/shared/logger";

function getVersion(): string {
  const pkgPath = resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}

/**
 * 错误码 → 进程退出码。
 * 目前所有业务错误码统一映射为 1；保留本表以便后续按语义区分（如用户取消、配置缺失）。
 */
const EXIT_CODES: Record<GrcErrorCode, number> = {
  CONFIG_MISSING: 1,
  NOT_GIT_REPO: 1,
  NO_STAGED_CHANGES: 1,
  NO_CHANGES: 1,
  USER_CANCELLED: 1,
  VALIDATION_FAILED: 1,
  LLM_FAILED: 1,
  GIT_FAILED: 1,
  UNKNOWN: 1,
};

function handleCliError(err: unknown): never {
  // F05 + 架构 A4：错误码由领域层给出，退出码翻译只发生在 CLI 出口这一处。
  if (err instanceof CliError) {
    console.error("错误:", err.message);
    process.exit(err.exitCode);
  }
  if (err instanceof GrcError) {
    console.error("错误:", err.message);
    process.exit(EXIT_CODES[err.code]);
  }
  console.error("意外错误:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const program = new Command();

program
  .name("grc")
  .version(getVersion(), "-v, --version", "显示当前版本")
  .description("一款使用 LLM 生成 Git 提交信息并执行提交的命令行工具")
  .helpOption("-h, --help", "显示帮助信息")
  .option("-s, --staged-only", "仅提交已暂存的变更")
  .option("-V, --verbose", "输出详细进度日志（debug 级别）")
  .option("--debug", "同 --verbose，输出 debug 级别日志")
  .option("--trace", "输出最详细的追踪日志（trace 级别）");

interface CliOptions {
  stagedOnly?: boolean;
  verbose?: boolean;
  debug?: boolean;
  trace?: boolean;
}

function applyLogLevel(options: CliOptions): void {
  let level: LogLevel = "info";
  if (options.trace) level = "trace";
  else if (options.debug || options.verbose) level = "debug";
  setLogLevel(level);
}

// 所有子命令共用：init 也能输出 debug/trace 日志。
program.hook("preAction", (thisCommand) => {
  applyLogLevel(thisCommand.opts() as CliOptions);
});

program
  .command("init")
  .description("交互式 LLM 配置初始化")
  .action(() => {
    runInit().catch(handleCliError);
  });

program.action((options: CliOptions) => {
  runCommit({ stagedOnly: options.stagedOnly ?? false }).catch(handleCliError);
});

export function runCli(): void {
  program.parse(process.argv);
}
