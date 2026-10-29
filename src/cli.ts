/**
 * CLI 入口 —— 启动命令行程序（F05）。
 *
 * 与库入口 src/lib.ts 并列，两个入口各产出一个产物：
 * - src/cli.ts  → dist/cli.cjs（带 shebang，供 grc / git-repo-comitter 命令）
 * - src/lib.ts  → dist/index.js / index.cjs（供其他代码 import/require）
 *
 * 命名为 cli.ts 而非 index.ts，是为了避免与库产物 dist/index.* 的语义混淆。
 */
import { runCli } from "@/app/cli/program";
import { setupNodeGitExecutor } from "@/node/setup";

// Node 入口：自动装配基于 child_process 的默认 git 执行器（F07）。
// 与库入口 lib.ts 共用同一装配逻辑；浏览器 / WebView 入口不装配。
setupNodeGitExecutor();

runCli();
