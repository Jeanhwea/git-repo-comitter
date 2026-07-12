import { loadConfig } from "../config/loader";
import { getAllDiff, hasStagedChanges } from "../git/diff";
import { gitCommit, gitAddAll } from "../git/commit";
import { generateCommitMessage } from "../llm/client";

export async function runCommit(): Promise<void> {
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
