import { Command } from "commander";
import { readFileSync } from "fs";
import { resolve } from "path";
import { runCommit } from "./commands/commit";
import { runInit } from "./commands/init";

const program = new Command();

program
  .name("grc")
  .version(getVersion(), "-v, --version", "Display the current version")
  .description(
    "A CLI tool that uses LLM to generate Git commit messages and execute commits",
  );

program
  .command("init")
  .description("Interactive LLM configuration initialization")
  .action(() => {
    runInit().catch((err: Error) => {
      console.error("Error:", err.message);
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
      console.error("Error:", err.message);
      process.exit(1);
    });
    return;
  }

  program.parse(process.argv);
}
