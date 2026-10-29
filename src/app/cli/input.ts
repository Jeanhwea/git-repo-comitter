/**
 * 应用层 —— 终端交互原语。
 *
 * 原先位于 shared/input：终端问答是 CLI 专属能力，放在公共层会让「库不碰终端」
 * 的约束失去编译期保障（架构 A6）。归入 app 后，domain / config / infra
 * 因无法引用本模块而在结构上就不可能弹出提问。
 */
import { createInterface } from "readline/promises";

export function question(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return rl.question(query).finally(() => rl.close());
}
