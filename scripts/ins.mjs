#!/usr/bin/env node
/**
 * 跨平台安装脚本（兼容 Windows / Linux / macOS）。
 *
 * 等价于原 ins.cmd / ins.sh：
 *   1. pnpm build；
 *   2. npm pack 产出 tarball；
 *   3. npm i -g 全局安装该 tarball（刻意用 npm 全局安装，避免 pnpm 全局链接的符号链接问题）；
 *   4. 删除 tarball。
 * 通过 Node child_process 调起 pnpm / npm，三平台行为一致。
 */
import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
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

// 1. 构建
console.log("[INFO] Building...");
if (run("pnpm", ["build"]) !== 0) process.exit(1);

// 2. 打包（捕获 stdout 拿到 tarball 文件名）
console.log("[INFO] Packing...");
const packRes = spawnSync("npm", ["pack"], {
  cwd: root,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "inherit"],
});
if (packRes.status !== 0) {
  console.error("[ERROR] npm pack failed");
  process.exit(1);
}
const tgzRaw = (packRes.stdout || "")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .pop();
const tgz = tgzRaw ? tgzRaw.split(/[\\/]/).pop() : "";
if (!tgz || !existsSync(resolve(root, tgz))) {
  console.error(`[ERROR] 未找到打包产物：${tgz}`);
  process.exit(1);
}

// 3. 全局安装
console.log(`[INFO] Installing ${tgz} globally...`);
if (run("npm", ["i", "-g", `./${tgz}`]) !== 0) {
  console.error("[ERROR] global install failed");
  process.exit(1);
}

// 4. 清理 tarball
if (existsSync(resolve(root, tgz))) {
  unlinkSync(resolve(root, tgz));
}

console.log("[OK] grc installed. Run: grc --help");
