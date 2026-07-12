import { Command } from "commander";
import { version } from "../package.json" with { type: "json" };
import { loadConfig } from "./config";
import { getAllDiff, hasStagedChanges } from "./git";
import { generateCommitMessage } from "./llm";
import { gitCommit, gitAddAll } from "./commit";
import { runInit } from "./init";

async function runCommit() {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error(
      "Error: LLM_API_KEY is not set. Please run `grc init` to configure.",
    );
    process.exit(1);
  }

  if (!hasStagedChanges()) {
    console.log("No staged changes found. Staging all changes...");
    gitAddAll();
  }

  const diff = getAllDiff();
  if (!diff.trim()) {
    console.log("No changes to commit.");
    process.exit(0);
  }

  console.log("Generating commit message...\n");
  const message = await generateCommitMessage(diff, config);
  console.log(`Commit message:\n  ${message}\n`);

  gitCommit(message);
  console.log("Commit successful!");
}

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
