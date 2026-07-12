# git-repo-comitter

基于大语言模型的 Git 提交信息生成工具。自动读取 Git 差异，调用 OpenAI 兼容 API 生成 Conventional Commits 格式的提交信息并执行提交。

## 特性

- 自动检测暂存/未暂存的变更，合并为完整 diff 提交给 LLM
- 支持 OpenAI 兼容 API（OpenAI、DeepSeek、通义千问等）
- 交互式初始化向导，配置持久化到 `~/.grc/config.json`
- 环境变量 `.env` 和用户配置文件双重覆盖
- 无暂存变更时自动 `git add -A`
- 内置 Conventional Commits 中文 prompt

## 安装

```bash
npx git-repo-comitter
```

本地开发：

```bash
pnpm build && node dist/index.cjs
```

## 使用

### 快速开始

```bash
# 交互式配置
npx git-repo-comitter init

# 生成提交信息并提交
npx git-repo-comitter
```

也提供别名 `grc`：

```bash
grc init
grc
```

### 配置优先级

1. 用户配置文件 `~/.grc/config.json`
2. 项目 `.env` 文件
3. 环境变量

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_API_KEY` | API 密钥 | - |
| `LLM_ENDPOINT` | API 端点 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名称 | `deepseek-v4-flash` |

### 交互式初始化

```bash
grc init
```

依次设置 API 地址、模型名称、API Key。配置保存到 `~/.grc/config.json`。

## 提交信息风格

使用 Conventional Commits 规范，中文描述。包含 `feat`、`fix`、`refactor`、`docs` 等类型，scope 可选，正文支持分条陈述。

## 技术栈

- TypeScript + Vite（构建 CLI 产物为 CommonJS）
- OpenAI SDK
- YAML（用户配置解析）
- dotenv（环境变量加载）
- Husky + lint-staged + ESLint + Prettier

## 许可

Unlicense — 公有领域贡献。
