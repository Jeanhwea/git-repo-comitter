import { Command } from "commander";
import { version } from "../package.json" with { type: "json" };
import { runCommit } from "./commands/commit";
import { runInit } from "./commands/init";

const program = new Command();

program
  .name("grc")
  .description(
    "A CLI tool that uses LLM to generate Git commit messages and execute commits",
  )
  .version(version, "-v, --version", "Display the current version");

program
  .command("init")
  .description("Interactive LLM configuration initialization")
  .action(() => {
    runInit().catch((err: Error) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
  });

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await runCommit();
    return;
  }

  program.parse(process.argv);
}

main().catch((err: Error) => {
  console.error("Error:", err.message);
  process.exit(1);
});
