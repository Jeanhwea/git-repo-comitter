/**
 * 应用层 —— 终端交互原语。
 *
 * 原先位于 shared/input：终端问答是 CLI 专属能力，放在公共层会让「库不碰终端」
 * 的约束失去编译期保障（架构 A6）。归入 app 后，domain / config / infra
 * 因无法引用本模块而在结构上就不可能弹出提问。
 */
import { createInterface } from "readline";
import { createInterface as createPromiseInterface } from "readline/promises";

export function question(query: string): Promise<string> {
  const rl = createPromiseInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return rl.question(query).finally(() => rl.close());
}

/**
 * 敏感输入（API Key）：提问文案照常显示，但用户输入不回显到终端。
 * 使用 readline 的公开 stdoutMuted 开关，避免依赖私有 _writeToOutput。
 * @param query - 提问文案。
 */
export function hiddenQuestion(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // stdoutMuted 是 readline 的公开运行时属性，当前 @types/node 尚未声明。
    const muted = rl as typeof rl & { stdoutMuted: boolean };
    muted.stdoutMuted = true;
    rl.on("error", reject);
    rl.question(query, (answer) => {
      muted.stdoutMuted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}
