# git-repo-comitter
[![npm version](https://img.shields.io/npm/v/git-repo-comitter)](https://www.npmjs.com/package/git-repo-comitter)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue)](https://unlicense.org)

基于大语言模型的 Git 提交信息生成工具。自动读取 Git 差异，调用 OpenAI 兼容 API 生成 [Conventional Commits](https://www.conventionalcommits.org/) 格式的提交信息并执行提交。

## 特性

- **自动差异收集** — 自动检测暂存/未暂存的变更，合并为完整 diff 提交给 LLM
- **模型无关** — 兼容任何 OpenAI 兼容 API（OpenAI、DeepSeek、通义千问等）
- **一站式配置** — 交互式初始化向导，配置持久化到 `~/.grc/config.json`
- **多层配置覆盖** — 环境变量 `.env`、用户配置、系统环境变量三层覆盖
- **零操作提交** — 无暂存变更时自动 `git add -A`
- **中文提交信息** — 内置 Conventional Commits 中文 prompt，生成中文描述

## 安装

```bash
npx grc --version
```

本地开发：

```bash
pnpm build && node dist/index.cjs
```

## 使用

### 快速开始

```bash
# 交互式配置
npx grc init

# 生成提交信息并提交
npx grc
```

### 配置优先级

1. 项目 `.env` 文件
2. 用户配置文件 `~/.grc/config.json`
3. 系统环境变量

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_API_KEY` | API 密钥 | — |
| `LLM_ENDPOINT` | API 端点 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名称 | `deepseek-v4-flash` |

### 交互式初始化

```bash
grc init
```

依次设置 API 地址、模型名称、API Key。配置保存到 `~/.grc/config.json`。

## 提交信息风格

遵循 Conventional Commits 规范，中文描述。支持 `feat`、`fix`、`refactor`、`docs` 等类型，scope 可选，正文支持分条陈述。

## 技术栈

- **运行时** — Node.js (TypeScript + Vite，产物为 CommonJS)
- **CLI 框架** — commander
- **LLM SDK** — OpenAI SDK
- **配置** — YAML + dotenv
- **工程化** — Husky + lint-staged + ESLint + Prettier

## 许可

[Unlicense](LICENSE) — 公有领域贡献。
