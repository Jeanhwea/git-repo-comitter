/**
 * 浏览器入口防回归护栏（F07 P3）。
 *
 * 在库 + 浏览器构建完成后运行，验证：
 *  1. dist/browser/ 产物不含任何 Node 内置模块引用（child_process / fs / os / path）；
 *  2. 浏览器产物可被 Node 正常 import，resolveConfig / validateCommitMessage 可调用；
 *  3. git 相关符号（getStagedDiff / gitCommit / setGitExecutor / execGit）不在公共 API 中，
 *     避免浏览器端误用（未装配时虽抛 GrcError，但更应直接从 API 面移除）。
 *
 * 任一检查失败即非零退出，阻断 CI。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const browserDir = resolve(root, "dist/browser");

let failures = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

// 1. 扫描产物中的 Node 内置模块引用（兼顾单/双引号两种写法）。
const FORBIDDEN = [
  'from "child_process"',
  "from 'child_process'",
  'from "fs"',
  "from 'fs'",
  'from "os"',
  "from 'os'",
  'from "path"',
  "from 'path'",
  'require("child_process")',
  "require('child_process')",
  'require("fs")',
  "require('fs')",
  'require("os")',
  "require('os')",
  'require("path")',
  "require('path')",
];

if (!existsSync(browserDir)) {
  fail(`浏览器产物目录不存在：${browserDir}（请先运行 vite 浏览器构建）`);
} else {
  const files = readdirSync(browserDir).filter((f) => f.endsWith(".js"));
  if (files.length === 0) {
    fail(`浏览器产物目录为空：${browserDir}`);
  }
  for (const file of files) {
    const content = readFileSync(resolve(browserDir, file), "utf-8");
    for (const token of FORBIDDEN) {
      if (content.includes(token)) {
        fail(`${file} 包含禁止的 Node 内置模块引用：${token}`);
      }
    }
  }
  if (failures === 0) pass("浏览器产物不含 Node 内置模块引用");
}

// 2 & 3. 动态导入浏览器产物做运行时校验。
const entry = resolve(browserDir, "index.js");
if (existsSync(entry)) {
  const mod = await import(pathToFileURL(entry).href);

  // resolveConfig 可调用且正确收敛配置。
  try {
    const cfg = mod.resolveConfig({
      apiKey: "k",
      endpoint: "https://example.com/v1",
    });
    if (cfg && cfg.apiKey === "k" && cfg.endpoint === "https://example.com/v1") {
      pass("resolveConfig 可调用且正确收敛配置");
    } else {
      fail(`resolveConfig 返回结果不符合预期：${JSON.stringify(cfg)}`);
    }
  } catch (err) {
    fail(`resolveConfig 调用抛错：${err?.message ?? err}`);
  }

  // validateCommitMessage 可校验合规消息、可拦截空消息。
  try {
    const ok = mod.validateCommitMessage("feat(core): 新增浏览器入口");
    if (ok && ok.valid === true) {
      pass("validateCommitMessage 可校验合规消息");
    } else {
      fail(`validateCommitMessage 对合规消息返回非预期结果：${JSON.stringify(ok)}`);
    }
    const bad = mod.validateCommitMessage("");
    if (bad && bad.valid === false) {
      pass("validateCommitMessage 可拦截空消息");
    } else {
      fail(`validateCommitMessage 对空消息未拦截：${JSON.stringify(bad)}`);
    }
  } catch (err) {
    fail(`validateCommitMessage 调用抛错：${err?.message ?? err}`);
  }

  // git 相关符号不应出现在公共 API。
  const gitSymbols = [
    "getStagedDiff",
    "gitCommit",
    "setGitExecutor",
    "execGit",
  ];
  const leaked = gitSymbols.filter((s) => typeof mod[s] !== "undefined");
  if (leaked.length === 0) {
    pass("git 相关符号未暴露到浏览器公共 API");
  } else {
    fail(`浏览器公共 API 泄漏了 git 符号：${leaked.join(", ")}`);
  }
} else {
  fail(`浏览器入口文件不存在：${entry}`);
}

if (failures > 0) {
  console.error(`\n浏览器入口护栏失败：${failures} 项`);
  process.exit(1);
}
console.log("\n浏览器入口护栏全部通过 ✅");
