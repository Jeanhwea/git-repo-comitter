/**
 * 应用层 —— CLI 入口。
 *
 * 负责命令注册、全局选项、日志级别与统一错误出口；业务流程委托给 commands/*。
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { Command } from "commander";

import { runCommit } from "@/app/commands/commit";
import { runInit } from "@/app/commands/init";
import { CliError, GrcError, type GrcErrorCode } from "@/shared/errors";
import { type LogLevel, setLogLevel } from "@/shared/logger";

function getVersion(): string {
  // 构建产物中 cli.cjs 位于 dist/，源码中本文件位于 src/app/cli/；
  // 两处向上查找的层级不同，按候选路径探测，避免源码态测试读不到版本。
  const candidates = [
    resolve(__dirname, "..", "package.json"),
    resolve(__dirname, "..", "..", "..", "package.json"),
  ];
  const pkgPath = candidates.find((path) => existsSync(path));
  if (!pkgPath) {
    throw new Error(`找不到 package.json：${candidates.join(" 或 ")}`);
  }
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
  RATE_LIMITED: 1,
  GIT_FAILED: 1,
  HOOK_BLOCKED: 1,
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
  const rawMessage = err instanceof Error ? err.message : String(err);
  // 上下文超长属于用户输入规模问题：给出可操作的提示，而不是裸的 400 错误。
  if (/maximum context length|context_length_exceeded/i.test(rawMessage)) {
    console.error(
      "错误: 输入内容超出模型上下文容量，请拆分提交或调大配置中的 maxInputTokens 后重试。",
    );
    console.error(`  模型原始信息: ${rawMessage}`);
    process.exit(1);
  }
  console.error("意外错误:", rawMessage);
  process.exit(1);
}

interface CliOptions {
  stagedOnly?: boolean;
  // commander 的 --no-verify 是负向选项：未传为 true，传入后为 false。
  verify?: boolean;
  // commander 的 --no-review 未传为 true，传入后为 false。
  review?: boolean;
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

/**
 * 构造一份全新的 CLI 程序实例。
 * 每次调用都是独立状态，避免测试或多次嵌入调用时选项互相污染。
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("grc")
    .version(getVersion(), "-v, --version", "显示当前版本")
    .description("一款使用 LLM 生成 Git 提交信息并执行提交的命令行工具")
    .helpOption("-h, --help", "显示帮助信息")
    .option("-s, --staged-only", "仅提交已暂存的变更")
    .option(
      "-n, --no-verify",
      "跳过 Git Hook 校验（等价于 git commit --no-verify）",
    )
    .option("--no-review", "跳过提交前的新增文件审查门禁（Q4）")
    .option("-V, --verbose", "输出详细进度日志（debug 级别）")
    .option("--debug", "同 --verbose，输出 debug 级别日志")
    .option("--trace", "输出最详细的追踪日志（trace 级别）");

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
    // 负向选项在此反转成正向的 noVerify，交给下游透传到 git commit（F09）。
    runCommit({
      stagedOnly: options.stagedOnly ?? false,
      noVerify: options.verify === false,
      review: options.review !== false,
    }).catch(handleCliError);
  });

  return program;
}

/**
 * 解析并执行命令行程序。
 * @param argv - 命令行参数；缺省回落到 process.argv，便于嵌入与测试注入。
 */
export function runCli(argv: string[] = process.argv): void {
  createProgram().parse(argv);
}
