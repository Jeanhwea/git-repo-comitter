# grc (the Git Repository Committer)

[![npm version](https://img.shields.io/npm/v/git-repo-comitter)](https://www.npmjs.com/package/git-repo-comitter)
[![CI](https://github.com/Jeanhwea/git-repo-comitter/actions/workflows/ci.yml/badge.svg)](https://github.com/Jeanhwea/git-repo-comitter/actions/workflows/ci.yml)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue)](https://unlicense.org)

基于大语言模型的 Git 提交信息生成工具。自动读取 Git 差异，调用 OpenAI 兼容 API 生成 [Conventional Commits](https://www.conventionalcommits.org/) 格式的提交信息并执行提交。

## 特性
- **自动差异收集** — 自动检测暂存/未暂存的变更，合并为完整 diff 提交给 LLM
- **一站式配置** — 交互式初始化向导，配置持久化到 `~/.grc/config.json`
- **中文提交信息** — 内置 Conventional Commits 中文 prompt，生成中文描述
- **可作为库接入** — 除命令行外，也暴露稳定的编程 API，供其他工具直接调用

## 使用示例
```text
D:\path\to\repo> grc
暂存所有变更...
正在生成提交信息...

提交信息：
  docs(readme): 更新 README 文档结构和配置说明

- 移除环境变量配置方式，统一使用 config.json
- 简化配置优先级为单一配置源
- 调整默认端点为 https://api.openai.com/v1

提交成功！

D:\path\to\repo>
```

## 快速开始

```bash
# 安装
npm i -g git-repo-comitter

# 交互式配置
grc init

# 生成提交信息并提交
grc
```

## 源码安装

```bash
pnpm i
pnpm build
npm i -g .
```

本地开发：

```bash
pnpm build && node dist/cli.cjs
```

代码校验（PR 时由 GitHub Actions 自动执行）：

```bash
pnpm lint          # ESLint 检查
pnpm format:check  # Prettier 格式检查
pnpm format        # Prettier 自动格式化
pnpm check         # TypeScript 类型检查
pnpm check:rules   # F04 规则 / 提示词 / 阈值对账
pnpm test          # 单元测试
```

## 使用

### 配置

所有配置通过 `~/.grc/config.json` 管理，不再支持环境变量。

### 配置文件结构

```json
{
  "endpoint": "https://api.openai.com/v1",
  "apiKey": "sk-xxx",
  "llm": {
    "model": "deepseek-v4-flash",
    "temperature": 0.7,
    "maxInputTokens": 262144,
    "maxOutputTokens": 8192
  }
}
```

### 交互式初始化

```bash
grc init
```

依次设置 API 地址、模型名称、API Key（输入不回显）。配置保存到 `~/.grc/config.json`，权限收紧为仅当前用户可读写（Windows 除外）。

CLI 选项：`--staged-only` 仅提交暂存区，`--no-verify` 跳过 Git Hook，`--no-review` 跳过提交前审查门禁。未配置 API Key 时自动使用规则化模式生成提交消息。

## 提交信息风格

遵循 Conventional Commits 规范，中文描述。支持 `feat`、`fix`、`refactor`、`docs` 等类型，scope 可选，正文支持分条陈述。

## 作为库使用

除命令行外，grc 也可以作为库被其他代码调用：

```ts
import { commit, resolveConfig } from "git-repo-comitter";

const config = resolveConfig({
  apiKey: process.env.OPENAI_API_KEY,
  endpoint: "https://api.openai.com/v1",
  llm: { model: "deepseek-v4-flash" },
});

const outcome = await commit({
  config,
  repoPath: "/path/to/repo", // 缺省为进程当前工作目录
  stagedOnly: false, // true 时只提交已暂存的变更
  onProgress: (msg) => console.log(msg), // 缺省静默
  noVerify: false, // true 时等价于 git commit --no-verify
  review: false,   // true 时启用审查门禁（需同时提供 onReview）
});

if (outcome.committed) {
  console.log(outcome.message, outcome.batchCount);
} else {
  console.log(outcome.reason, outcome.detail); // 例如 NO_CHANGES
}
```

也支持按需取用底层能力，自行编排流程：

```ts
import { generateCommitMessage, getStagedDiff, gitCommit } from "git-repo-comitter";

const message = await generateCommitMessage(getStagedDiff(), config);
gitCommit(message);
```

### 公共 API

| 导出 | 说明 |
|------|------|
| `commit(request)` | 完整流程：暂存 → 审查 → 生成提交信息 → 提交，返回结果对象 |
| `generateCommitMessage(diff, config)` | 单批生成提交信息 |
| `generateCommitMessageBatched(diff, config)` | 分批生成再合并，返回 `{ message, batchCount }` |
| `validateCommitMessage(content)` | 按 Conventional Commits 约束校验一条提交信息 |
| `getStagedDiff(cwd?)` | 取得暂存区 diff（已排除二进制内容） |
| `gitCommit(message, cwd?, noVerify?)` | 执行一次 `git commit`；`noVerify` 为 true 时跳过 Git Hook |
| `runGrc({ argv? })` | 从 `git-repo-comitter/cli` 导入的 CLI 一键入口，供 Node 宿主嵌入 |
| `resolveConfig(user?)` / `loadDefaultConfig()` / `loadUserConfigFile()` | 组装配置，纯函数、不产生副作用 |
| `GrcError` / `GrcErrorCode` | 错误类型与稳定错误码 |
| `setProgressSink` / `setLogSink` / `setLogLevel` | 进度输出槽、日志输出槽与日志级别 |

### 与命令行的差异

库接口刻意不做任何「面向终端」的事情，便于被嵌入到别的程序中：

| 维度 | 命令行 | 库 |
|------|--------|-----|
| 配置 | 读取 `~/.grc/config.json`，缺失时提示 `grc init` | 必须显式传入 `config`，不读全局文件 |
| 输出 | 直接打印进度与结果 | 默认静默，需通过 `onProgress` / `setProgressSink` 接收 |
| 交互 | 审查门禁默认开启，可用 `--no-review` 关闭 | 默认关闭；设置 `review: true` 并提供 `onReview` 才启用 |
| 失败 | 打印错误并以退出码结束进程 | 抛出 `GrcError`，由调用方按 `code` 分支处理 |

浏览器场景从 `git-repo-comitter/browser` 导入（仅 ESM）：提供配置、生成、校验与横切能力，不暴露任何 git 读写 API，diff 由宿主侧计算后以字符串传入。

> 命令行本身就是这套 API 的消费者：两者共用同一条提交流程与提交前校验门禁，不按 API Key 是否配置分叉行为。
