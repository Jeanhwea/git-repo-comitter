import { Command } from "commander";
import { readFileSync } from "fs";
import { resolve } from "path";

import { runCommit } from "./commands/commit";
import { runInit } from "./commands/init";
import { CliError } from "./errors";

export function getVersion(): string {
  const pkgPath = resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}

function handleCliError(err: unknown): never {
  if (err instanceof CliError) {
    console.error("错误:", err.message);
    process.exit(err.exitCode);
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
  .option("-s, --staged-only", "仅提交已暂存的变更");

program
  .command("init")
  .description("交互式 LLM 配置初始化")
  .action(() => {
    runInit().catch(handleCliError);
  });

program.action((options) => {
  runCommit({ stagedOnly: options.stagedOnly ?? false }).catch(handleCliError);
});

export function runCli(): void {
  program.parse(process.argv);
}
