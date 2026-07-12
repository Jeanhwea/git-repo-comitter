import { Command } from "commander";
import { readFileSync } from "fs";
import { resolve } from "path";
import { runCommit } from "./commands/commit";
import { runInit } from "./commands/init";

const program = new Command();

program
  .name("grc")
  .version(getVersion(), "-v, --version", "显示当前版本")
  .description("一款使用 LLM 生成 Git 提交信息并执行提交的命令行工具")
  .helpOption("-h, --help", "显示帮助信息");

program
  .command("init")
  .description("交互式 LLM 配置初始化")
  .action(() => {
    runInit().catch((err: Error) => {
      console.error("错误:", err.message);
      process.exit(1);
    });
  });

function getVersion(): string {
  const pkgPath = resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}

export function runCli(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    runCommit().catch((err: Error) => {
      console.error("错误:", err.message);
      process.exit(1);
    });
    return;
  }

  program.parse(process.argv);
}
