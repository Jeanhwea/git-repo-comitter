/**
 * CLI 入口 —— 启动命令行程序（F05 / F08）。
 *
 * 与库入口 src/lib.ts 并列，两个入口各产出一个产物：
 * - src/cli.ts  → dist/cli.cjs（带 shebang，供 grc / git-repo-comitter 命令）
 * - src/lib.ts  → dist/index.js / index.cjs（供其他代码 import/require）
 *
 * 命名为 cli.ts 而非 index.ts，是为了避免与库产物 dist/index.* 的语义混淆。
 *
 * F08：把原本散落在模块顶层的「装配 + 运行」收敛为一个显式的一键入口 runGrc()，
 * 由它组合 setupNodeGitExecutor() 与 runCli()。这样 CLI 既能保持 bin 行为，
 * 又能被 Node 宿主（嵌入、测试）以函数形式接入，且 import 本模块不再触发副作用。
 */
import { runCli } from "@/app/cli/program";
import { setupNodeGitExecutor } from "@/node/setup";

/** runGrc 的选项。 */
export interface RunGrcOptions {
  /** 自定义命令行参数；缺省回落到 process.argv，便于嵌入与测试。 */
  argv?: string[];
}

/**
 * CLI 一键入口：装配 Node 默认 git 执行器（F07）后运行命令行程序。
 *
 * 供 Node 宿主 / 测试以编程方式接入 CLI；浏览器 / WebView 场景请走 lib-browser.ts，
 * 不要调用本函数（其会强制装配基于 child_process 的执行器）。
 * @param options - 可选参数，传入 argv 可覆盖命令行参数。
 */
export function runGrc(options: RunGrcOptions = {}): void {
  // 强制装配：只要走 CLI 入口，就一定注册 child_process 执行器（S07 §3 约定 E1），
  // 避免历史上「CLI 入口漏装导致 git 执行器未装配」的问题。
  setupNodeGitExecutor();
  runCli(options.argv);
}

// 仅当本文件作为 bin 直接执行时才启动（dist/cli.cjs）。
// 被 import 接入（测试、Node 宿主）时不触发副作用，由调用方显式 runGrc()。
const isRunAsBin =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isRunAsBin) {
  runGrc();
}
