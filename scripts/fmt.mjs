#!/usr/bin/env node
/**
 * 跨平台格式化脚本（兼容 Windows / Linux / macOS）。
 *
 * 等价于原 fmt.cmd / fmt.sh：
 *   1. 检查 pnpm 是否可用；
 *   2. 缺 node_modules 时自动 pnpm install；
 *   3. 调用 pnpm format。
 * 通过 Node child_process 调起 pnpm，不依赖特定 shell，三平台行为一致。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 运行命令，stdio 透传到当前终端；返回退出码。 */
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: opts.silent ? "ignore" : "inherit",
    shell: true,
  });
  return res.status ?? 1;
}

// 1. 检查 pnpm
if (run("pnpm", ["--version"], { silent: true }) !== 0) {
  console.error(
    "[ERROR] pnpm not found. Install it first: npm install -g pnpm",
  );
  process.exit(1);
}

// 2. 缺 node_modules 时自动安装
if (!existsSync(resolve(root, "node_modules"))) {
  console.warn("[WARN] node_modules not found. Running pnpm install...");
  if (run("pnpm", ["install"]) !== 0) {
    console.error("[ERROR] pnpm install failed");
    process.exit(1);
  }
}

// 3. 格式化
console.log("[INFO] Running prettier ...");
if (run("pnpm", ["format"]) !== 0) {
  console.error("[ERROR] Formatting failed");
  process.exit(1);
}

console.log("[OK] Formatting complete");
