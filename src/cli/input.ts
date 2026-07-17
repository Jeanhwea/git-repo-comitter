import { createInterface } from "readline/promises";

export function question(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return rl.question(query).finally(() => rl.close());
}
