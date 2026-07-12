# git-repo-comitter

基于大语言模型的 Git 提交信息生成工具。
自动读取 Git 差异，调用 OpenAI 兼容 API 生成 Conventional Commits 格式的提交信息并执行提交。

## 使用

1. 配置环境变量：`LLM_API_KEY`、`LLM_ENDPOINT`、`LLM_MODEL`，或运行交互式初始化命令：

   ```bash
   npx git-repo-comitter init
   ```

   交互式命令会将配置保存到 `~/.grc/config.json`。

2. 运行：

   ```bash
   # 发布后直接使用
   npx git-repo-comitter

   # 本地开发
   pnpm build && node dist/index.cjs
   ```

也可通过 `config.yaml` 自定义模型参数和生成风格。
