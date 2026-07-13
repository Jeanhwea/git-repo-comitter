import { execGit } from "./runner";

export function gitAddAll(): void {
  execGit(["add", "."]);
}

export function gitCommit(message: string): void {
  execGit(["commit", "-m", message]);
}
