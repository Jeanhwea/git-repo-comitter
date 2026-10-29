#!/usr/bin/env node
/**
 * 统一构建编排脚本（F05 / F07）。
 *
 * package.json 的 `build` 脚本已指向本文件（node scripts/build.mjs）。
 * 构建被拆成可按目标独立执行的子任务，顺序与依赖关系如下：
 *
 *   check    tsc --noEmit              类型检查（最先，失败即停）
 *   lib      vite build                库构建（ESM + CJS），会清空 dist
 *   cli      vite build -c cli         CLI 构建（CJS + shebang）
 *   browser  vite build -c browser     浏览器构建（ESM，写入 dist/browser）
 *   types    tsc -p build + tsc-alias  类型声明生成 + 路径别名解析
 *   guard    scripts/check-browser-entry.mjs  浏览器入口防回归护栏
 *
 * 依赖次序要求：lib 必须先于 cli / browser（后者关闭了 emptyOutDir）；
 * types / guard 依赖前序产物。无论用户以何种顺序传入目标，脚本都按上面的
 * 规范顺序执行，保证依赖正确。
 *
 * 用法：
 *   node scripts/build.mjs                       # 全量：check + lib + cli + browser + types + guard
 *   node scripts/build.mjs lib                   # 仅库构建
 *   node scripts/build.mjs cli browser           # 多个目标（按规范顺序执行）
 *   node scripts/build.mjs --skip guard          # 全量但跳过护栏
 *   node scripts/build.mjs -h | --help           # 打印帮助
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** 各构建目标的命令与描述。 */
const RUN = {
  check: {
    cmd: "pnpm exec tsc --noEmit",
    desc: "tsc 类型检查",
  },
  lib: {
    cmd: "pnpm exec vite build",
    desc: "vite 库构建 (ESM + CJS)",
  },
  cli: {
    cmd: "pnpm exec vite build --config vite.cli.config.ts",
    desc: "vite CLI 构建 (CJS + shebang)",
  },
  browser: {
    cmd: "pnpm exec vite build --config vite.browser.config.ts",
    desc: "vite 浏览器构建 (ESM)",
  },
  types: {
    cmd: "pnpm exec tsc -p tsconfig.build.json && pnpm exec tsc-alias -p tsconfig.build.json",
    desc: "类型声明生成 + 路径别名解析",
  },
  guard: {
    cmd: `node "${resolve(root, "scripts/check-browser-entry.mjs")}"`,
    desc: "浏览器入口防回归护栏",
  },
};

/** 全量目标序列，同时也是规范执行顺序。 */
const ORDER = ["check", "lib", "cli", "browser", "types", "guard"];

const HELP = `
统一构建编排脚本

用法:
  node scripts/build.mjs [目标...] [--skip 目标...] [-h|--help]

目标 (可多选):
  ${ORDER.map((t) => `${t.padEnd(8)} ${RUN[t].desc}`).join("\n  ")}

说明:
  - 不带任何参数 => 全量构建 (${ORDER.join(" + ")})
  - 传入目标 => 仅执行这些目标，但始终按规范顺序 (${ORDER.join(" > ")}) 执行
  - --skip 目标 => 全量但跳过指定目标
  - 任一目标失败会立即中断，避免依赖缺失的产物被继续加工
`.trimStart();

function parseArgs(argv) {
  const positional = [];
  const skip = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--skip") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        skip.add(argv[++i]);
      }
    } else if (a.startsWith("-")) {
      console.error(`[ERROR] 未知参数: ${a}`);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  const chosen = (positional.length ? positional : [...ORDER]).filter(
    (t) => !skip.has(t),
  );
  return chosen;
}

function main() {
  const targets = parseArgs(process.argv.slice(2));

  // 校验未知目标。
  const unknown = targets.filter((t) => !(t in RUN));
  if (unknown.length) {
    console.error(`[ERROR] 未知构建目标: ${unknown.join(", ")}`);
    console.error(`[INFO] 可用目标: ${ORDER.join(", ")}`);
    process.exit(2);
  }

  // 按规范顺序排序，保证依赖正确。
  const ordered = ORDER.filter((t) => targets.includes(t));

  console.log(`\n[INFO] 本次构建目标: ${ordered.join(" > ")}\n`);

  let failed = 0;
  for (const t of ordered) {
    const task = RUN[t];
    console.log(`[INFO] ${task.desc} (${t})`);
    try {
      execSync(task.cmd, { stdio: "inherit", cwd: root });
      console.log(`[OK] ${task.desc}`);
    } catch (err) {
      console.error(`\n  ✗ ${task.desc} 失败，已中断后续构建`);
      failed++;
      break;
    }
  }

  if (failed > 0) {
    console.error(`\n[FAIL] 构建未通过 (${failed} 项失败)`);
    process.exit(1);
  }
  console.log("\n[OK] 构建完成 ✅");
}

main();
