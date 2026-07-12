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

async function main() {
  const subcommand = process.argv[2];

  if (subcommand === "init") {
    await runInit();
  } else {
    await runCommit();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
