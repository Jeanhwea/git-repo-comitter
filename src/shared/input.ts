/**
 * 公共层 —— 终端交互原语。
 *
 * 原先位于 app/cli/input.ts，被领域层（审查门禁）与配置加载器同时使用，
 * 后者甚至自己内联了一份 readline 问答（I06 的 P7）。归入 shared 后两侧共用同一实现。
 */
import { createInterface } from "readline/promises";

export function question(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return rl.question(query).finally(() => rl.close());
}
