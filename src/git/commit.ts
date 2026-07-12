import { execSync } from "child_process";

export function gitAddAll(): void {
  execSync("git add .", { cwd: process.cwd(), encoding: "utf-8" });
}

export function gitCommit(message: string): void {
  const escapedMessage = message.replace(/"/g, '\\"');
  execSync(`git commit -m "${escapedMessage}"`, {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  console.log(`提交信息：\n  ${message}\n`);
}
