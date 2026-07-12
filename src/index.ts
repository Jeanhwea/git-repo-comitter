#!/usr/bin/env node

import { loadConfig } from "./config";
import { getAllDiff, hasStagedChanges } from "./git";
import { generateCommitMessage } from "./llm";
import { gitCommit, gitAddAll } from "./commit";

async function main() {
  const config = loadConfig();

  if (!hasStagedChanges(config.git.repoPath)) {
    console.log("No staged changes found. Staging all changes...");
    gitAddAll(config.git.repoPath);
  }

  const diff = getAllDiff(config.git.repoPath);
  if (!diff.trim()) {
    console.log("No changes to commit.");
    process.exit(0);
  }

  console.log("Generating commit message...\n");
  const message = await generateCommitMessage(diff, config);
  console.log(`Commit message:\n  ${message}\n`);

  gitCommit(message, config.git.repoPath);
  console.log("Commit successful!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
