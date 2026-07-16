# 优化 src 下代码架构

## Summary

对 `src/` 进行**全面内部重构**（不引入接口/依赖注入），通过 6 项"深化"改造消除重复代码、收拢散落的职责、修复 batch 合并逻辑的不一致。目标：提升 locality（变更集中在一处）与 leverage（小接口背后更多行为），不改变任何对外行为。

## Current State Analysis

当前架构（已通读 `src/` 全部 16 个文件）存在以下摩擦点：

| # | 位置 | 问题 | 删除测试 |
|---|------|------|----------|
| 1 | `batch.ts`/`reviewer.ts`/`client.ts` | `client.chat.completions.create({model, temperature, max_tokens, messages})` + `extractContent` 重复 4 处；DeepSeek 原始 JSON workaround 散落 | 删掉重复后复杂度集中在 `client.ts`，符合深化 |
| 2 | `commit.ts` `confirmSuspiciousNewFiles` | LLM 审查 + 用户交互 + git reset + 暂存重检全揉在编排器里，locality 差 | 抽出后 `commit.ts` 回归纯编排 |
| 3 | `batch.ts` 合并阶段 | `mergePartialMessages` 带 token 省略逻辑，但 `retryWithValidation` 重建的 messages **丢弃**省略逻辑，重生成上下文与初始合并不一致 | 修复后两处共享同一构造函数 |
| 4 | `commit.ts:39` `getChanges`、`commit.ts:62` `execGit(["reset",...])` | git 操作泄漏到命令层，绕过 git 模块接缝 | 移入 git 模块后接缝闭合 |
| 5 | `utils/index.ts` | 纯透传 `export * from "./cli"`，且 grep 确认**无人 import `../utils`**（调用方均直接 import `../utils/cli`） | 删除无影响，纯浅模块 |
| 6 | `config/types.ts` | `DEFAULT_CONFIG` 是运行时值却放在纯类型文件 | 移到唯一消费者 `loader.ts` |

## Proposed Changes

### 1. 统一 LLM 调用模块 — 深化 `src/llm/client.ts`

**What/Why:** 4 处重复的 `create` 参数构造 + `extractContent` 收敛为一处，DeepSeek workaround 的 leakage 集中化。

**How:** 在 `client.ts` 新增低层调用函数：

```typescript
/** 低层：构造参数、调用 create、返回提取后内容（可能为空串）。 */
export async function chatCompletion(
  config: AppConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  temperatureOverride?: number,
): Promise<string> {
  const client = createClient(config);
  const response = await client.chat.completions.create({
    model: config.llm.model,
    temperature: temperatureOverride ?? config.llm.temperature,
    max_tokens: config.llm.maxOutputTokens,
    messages,
  });
  return extractContent(response);
}

/** 高层：单轮 system+user 便捷封装。 */
export async function singleTurn(
  config: AppConfig,
  systemPrompt: string,
  userContent: string,
  temperatureOverride?: number,
): Promise<string> {
  return chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], temperatureOverride);
}
```

调用方改造：
- `client.ts` `retryWithValidation`：重生成处用 `chatCompletion(config, messages)` 替换内联 `create`+`extractContent`；空内容检查保留（带 label）。
- `batch.ts` `generatePartialMessage`：改用 `singleTurn(config, PARTIAL_SYSTEM_PROMPT, userContent)`。
- `batch.ts` `mergePartialMessages`：改用 `singleTurn(config, MERGE_SYSTEM_PROMPT, userContent)`。
- `reviewer.ts` `reviewNewFiles`：改用 `singleTurn(config, REVIEW_SYSTEM_PROMPT, userContent, 0)`，再 `JSON.parse`。

### 2. 抽取提交前审查流程 — 新增 `src/commands/review.ts`

**What/Why:** 把 `confirmSuspiciousNewFiles` 从 `commit.ts` 抽出为独立深模块，让审查流程的 locality 集中（LLM 审查→用户确认→排除→重检）。

**How:** 新建 `src/commands/review.ts`：

```typescript
export async function runReviewGate(
  config: AppConfig,
  stagedOnly: boolean,
): Promise<void> { /* 原 confirmSuspiciousNewFiles 逻辑，用步骤 4 的 gitReset */ }
```

`commit.ts` 改为 `await runReviewGate(config, !!options.stagedOnly);`，并删除原 `confirmSuspiciousNewFiles`。

### 3. 修复 `batch.ts` 合并逻辑不一致

**What/Why:** 消除 `mergePartialMessages`（带省略）与 `retryWithValidation` 重生成（不带省略）的上下文偏差。

**How:** 在 `batch.ts` 抽出共享构造函数：

```typescript
function buildMergeMessages(
  partialMessages: string[],
  config: AppConfig,
): OpenAI.ChatCompletionMessageParam[] {
  const limit = effectiveLimit(config, MERGE_SYSTEM_PROMPT);
  const parts: string[] = [];
  let totalTokens = 0;
  let omitted = 0;
  for (let i = 0; i < partialMessages.length; i++) {
    const part = `--- 部分 ${i + 1} ---\n${partialMessages[i]}`;
    const partTokens = estimateTokens(part);
    if (totalTokens + partTokens <= limit) { parts.push(part); totalTokens += partTokens; }
    else { omitted = partialMessages.length - i; break; }
  }
  const userContent = parts.join("\n\n") +
    (omitted > 0 ? `\n\n[... 前面 ${omitted} 个批次已省略 ...]` : "");
  return [
    { role: "system", content: MERGE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
```

- `mergePartialMessages` 改为 `return singleTurn` 基于 `buildMergeMessages(...)` 的 userContent（或直接 `chatCompletion(config, buildMergeMessages(...))`）。
- `generateCommitMessageBatched` 末尾用**同一** `buildMergeMessages(partialMessages, config)` 传入 `retryWithValidation(config, messages, { initialMessage: merged })`。

### 4. 收拢 git 接缝泄漏 — 修改 `src/git/runner.ts` 与 `src/git/diff.ts`

**What/Why:** `commit.ts` 直接调 `execGit(["reset",...])` 和 `execGit(["diff","--cached"])`，绕过 git 抽象。

**How:**
- `git/runner.ts` 新增 `gitReset(files: string[]): void { execGit(["reset", "--", ...files]); }`。
- `git/diff.ts` 新增 `getStagedDiff(): string { return execGit(["diff", "--cached"], { tolerateError: true }); }`，并导出。
- `commands/review.ts`（步骤 2）用 `gitReset` 替换内联 `execGit(["reset",...])`。
- `commit.ts` `getChanges` 改为调用 `getStagedDiff()`，删除 `commit.ts` 对 `execGit` 的直接 import。

### 5. 删除浅模块 `src/utils/index.ts`

**What/Why:** 纯透传且无人引用（grep 确认调用方均 `import { question } from "../utils/cli"`）。

**How:** 直接 `DeleteFile` `src/utils/index.ts`。无需改动其它文件。

### 6. 分离类型与运行时默认值

**What/Why:** `DEFAULT_CONFIG` 是运行时值，不该在 `types.ts`；仅 `loader.ts` 使用。

**How:**
- 从 `config/types.ts` 移除 `DEFAULT_CONFIG`（保留 `LLMConfig`/`AppConfig` 接口）。
- 在 `config/loader.ts` 内定义 `const DEFAULT_CONFIG: AppConfig = { ... }`（改为模块内常量，不导出）。
- 移除 `loader.ts` 对 `DEFAULT_CONFIG` 的 import。

## Assumptions & Decisions

- **不引入接口/DI**：用户明确选择纯内部重构；当前无测试，避免过度工程。
- **不改对外行为**：所有改造保持 CLI 行为、配置格式、LLM 提示词、错误信息不变。
- **`utils/cli.ts` 保留**：`question` 仍被 `init.ts`/`commands/review.ts` 使用，仅删 `utils/index.ts`。
- **`review.ts` 放 `commands/`**：作为 commit 流水线步骤，与编排器 `commit.ts` 同层，便于后续理解流程。
- **`chatCompletion` 返回空串由调用方报错**：保留各调用方带 label 的错误信息（"分批 diff"/"合并提交信息"/"审查新增文件"）。
- **`extractContent` 保留在 `response.ts`**：DeepSeek workaround 的适配器，已是合理接缝，不移动。

## Verification

1. `pnpm run check` — `tsc --noEmit` 类型检查通过。
2. `pnpm run lint` — ESLint 通过。
3. `pnpm run build` — 完整构建（tsc + vite build）通过。
4. 手动冒烟（在测试 git 仓库）：
   - `grc init` 流程正常。
   - `grc` 默认提交流程正常（含小 diff 单批、大 diff 多批合并）。
   - `grc -s` 仅暂存提交正常。
   - 触发可疑文件审查：新增一个临时文件，确认审查提示与排除流程正常。
5. 确认 `utils/index.ts` 删除后无 import 报错。
6. 确认 batch 多批场景下，`retryWithValidation` 重生成（如有）与初始合并使用一致的省略上下文。

## 执行顺序

1. 步骤 6（types/loader 分离）— 最小独立改动。
2. 步骤 1（统一 LLM 调用）— 步骤 3 依赖此。
3. 步骤 3（修复 batch 合并）— 依赖步骤 1。
4. 步骤 4（git 接缝收拢）— 步骤 2 依赖此。
5. 步骤 2（抽取审查流程）— 依赖步骤 4。
6. 步骤 5（删 utils/index.ts）— 收尾。
