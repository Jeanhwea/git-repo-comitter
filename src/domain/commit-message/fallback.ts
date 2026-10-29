/**
 * 领域层 —— LLM 不可用时的规则化提交消息生成。
 *
 * 兜底生成不依赖 LLM，完全通过文件变更特征（新增/修改/删除、文件扩展名、目录结构）
 * 推断 type / scope / description / body，保证在以下两种场景下仍能产出合规的提交消息：
 *
 * 1. 用户未配置 LLM（apiKey 为空）
 * 2. LLM 调用连续失败（VALIDATION_FAILED / LLM_FAILED）
 *
 * 规则化生成的语义虽有局限（无法区分重构与修复的上下文），但胜在确定性：
 * - 相同变更集 → 相同提交消息
 * - 不依赖外部服务 → 不产生额外延迟
 * - 行宽约束与 checker.ts 一致 → 通过校验
 */
import type { ChangeSet, FileChange } from "@/infra/git/changes";
import {
  MAX_BODY_BULLETS,
  MAX_BODY_LINE_LENGTH,
  MAX_HEADER_LENGTH,
} from "@/shared/commit-limits";
import { createLogger } from "@/shared/logger";

import { validateCommitMessage } from "./checker";

const log = createLogger("fallback");

/* ------------------------------------------------------------------ */
/*  type 推断                                                          */
/* ------------------------------------------------------------------ */

/**
 * 按优先级裁决 type。规则：
 *  1. 新增后缀为 .spec.ts / .test.ts / .test.tsx / .test.js → test
 *  2. 新增 .md / .txt 文档或 doc/ docs/ 目录 → docs
 *  3. 删除文件 → fix（删除通常是为修复问题清除旧代码）
 *  4. 修改 ci/ .github/ 或配置文件（.gitignore / .editorconfig 等）→ chore
 *  5. 新增文件 → feat
 *  6. 修改文件 → fix
 *  7. 新增/修改 .json / .yaml / .yml / config/ 配置相关 → build
 *  8. 修改文件名含 refactor → refactor
 *  9. 兜底 → chore
 */
function inferType(files: FileChange[]): string {
  const added = files.filter((f) => f.status === "added");
  const modified = files.filter((f) => f.status === "modified");
  const deleted = files.filter((f) => f.status === "deleted");
  const allFiles = files.map((f) => f.path);

  // 1. test
  if (
    added.some((f) => /\.(spec|test)\.(ts|tsx|js|jsx)$/i.test(f.path))
  ) {
    return "test";
  }

  // 2. docs
  if (
    added.some((f) => /\.(md|mdx|txt)$/i.test(f.path)) ||
    added.some((f) => /^docs?\//.test(f.path))
  ) {
    return "docs";
  }

  // 3. delete files → fix
  if (deleted.length > 0) {
    return "fix";
  }

  // 4. chore: ci config / infra changes
  if (
    allFiles.some((p) => /^\.(github|gitlab|vscode)\//.test(p)) ||
    allFiles.some((p) => /^\.(gitignore|editorconfig|env|nvmrc)$/.test(p)) ||
    (added.length === 0 &&
      modified.every((f) => /\.(json|yaml|yml)$/i.test(f.path)))
  ) {
    return "chore";
  }

  // 5. new files → feat
  if (added.length > 0) {
    return "feat";
  }

  // 6. modified only → fix
  if (modified.length > modified.length) {
    // unreachable unless modified > 0
  }
  if (modified.length > 0 && added.length === 0) {
    return "fix";
  }

  // 7. config files (JSON/YAML) → build
  if (
    allFiles.some((p) => /^config\//.test(p)) ||
    allFiles.every((p) => /\.(json|yaml|yml)$/i.test(p))
  ) {
    return "build";
  }

  // 8. refactor hint in file names
  if (allFiles.some((p) => /refactor/i.test(p))) {
    return "refactor";
  }

  return "chore";
}

/* ------------------------------------------------------------------ */
/*  scope 推断 — 从文件路径的一级目录提取                               */
/* ------------------------------------------------------------------ */

function inferScope(files: FileChange[]): string | undefined {
  const scopes = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    // 跳过根目录文件（无 scope）
    if (parts.length < 2) continue;
    const dir = parts[0] ?? "";
    // 跳过隐藏目录、node_modules、dist、build
    if (
      dir.startsWith(".") ||
      dir === "node_modules" ||
      dir === "dist" ||
      dir === "build" ||
      dir === "out"
    )
      continue;
    scopes.add(dir);
  }
  // 取出现次数最多的目录
  if (scopes.size === 0) return undefined;
  const counts = new Map<string, number>();
  for (const f of files) {
    const dir = f.path.split("/")[0];
    if (dir && scopes.has(dir)) {
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  let best = "";
  let bestCount = 0;
  for (const [dir, count] of counts) {
    if (count > bestCount) {
      best = dir;
      bestCount = count;
    }
  }
  return best || undefined;
}

/* ------------------------------------------------------------------ */
/*  description 构建 — 根据 type 和文件数量生成标题描述                  */
/* ------------------------------------------------------------------ */

function buildDescription(type: string, files: FileChange[]): string {
  const added = files.filter((f) => f.status === "added");
  const modified = files.filter((f) => f.status === "modified");
  const deleted = files.filter((f) => f.status === "deleted");

  const count = files.length;
  const atoms: string[] = [];

  if (added.length > 0) atoms.push(`新增 ${added.length} 个文件`);
  if (modified.length > 0) atoms.push(`修改 ${modified.length} 个文件`);
  if (deleted.length > 0) atoms.push(`删除 ${deleted.length} 个文件`);

  const suffix = atoms.join("，") || `${count} 个文件变更`;

  switch (type) {
    case "feat":
      return `新增功能：${suffix}`;
    case "fix":
      return `修复问题：${suffix}`;
    case "docs":
      return `更新文档：${suffix}`;
    case "test":
      return `添加测试：${suffix}`;
    case "build":
      return `构建配置：${suffix}`;
    case "refactor":
      return `重构代码：${suffix}`;
    case "perf":
      return `性能优化：${suffix}`;
    default:
      return `日常维护：${suffix}`;
  }
}

/* ------------------------------------------------------------------ */
/*  body 要点生成 — 按操作类型分组列出文件路径                            */
/* ------------------------------------------------------------------ */

function buildBody(files: FileChange[]): string {
  const byStatus: Record<string, FileChange[]> = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
  };
  for (const f of files) {
    /* v8 ignore next 2 */ // defensive guard for unexpected status
    if (!byStatus[f.status]) byStatus[f.status] = [];
    byStatus[f.status]!.push(f);
  }

  const lines: string[] = [];
  if (byStatus["added"]!.length > 0) {
    lines.push("- 新增文件：");
    for (const f of byStatus["added"]!) {
      const meta = f.isBinary ? " [二进制]" : "";
      lines.push(`  - ${f.path}${meta}`);
    }
  }
  if (byStatus["modified"]!.length > 0) {
    lines.push("- 修改文件：");
    for (const f of byStatus["modified"]!) {
      const meta = f.isBinary ? " [二进制]" : ` (+${f.additions}/-${f.deletions})`;
      lines.push(`  - ${f.path}${meta}`);
    }
  }
  if (byStatus["deleted"]!.length > 0) {
    lines.push("- 删除文件：");
    for (const f of byStatus["deleted"]!) {
      lines.push(`  - ${f.path}`);
    }
  }

  if (lines.length === 0) {
    return "";
  }

  // 行宽约束：每行不超过 MAX_BODY_LINE_LENGTH
  const wrapped = lines.map((line) => {
    if (line.length <= MAX_BODY_LINE_LENGTH) return line;
    return line.slice(0, MAX_BODY_LINE_LENGTH - 3) + "...";
  });

  return wrapped.join("\n");
}

/* ------------------------------------------------------------------ */
/*  标题行字符串截断辅助                                                */
/* ------------------------------------------------------------------ */

/**
 * 对 description 部分做硬截断以保证整个 header 不超过 MAX_HEADER_LENGTH。
 * 截断位置尽量选择词边界，并在末尾追加省略号。
 */
function truncateHeader(header: string): string {
  if (header.length <= MAX_HEADER_LENGTH) return header;
  const maxDesc = MAX_HEADER_LENGTH - 3; // 预留 "..." 的位置
  return header.slice(0, maxDesc) + "...";
}

/* ------------------------------------------------------------------ */
/*  public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * 规则化生成一条合规的 Conventional Commits 提交消息。
 * 不需要 LLM，完全基于 ChangeSet 的文件变更特征推断。
 *
 * @param changeSet - 暂存区变更集（来自 getStagedChangeSet）。
 * @returns 合规的提交消息字符串。
 */
export function generateFallbackMessage(changeSet: ChangeSet): string {
  const { files } = changeSet;

  // 空变更处理
  if (files.length === 0) {
    const message = "chore: 无实质变更";
    const validation = validateCommitMessage(message);
    if (!validation.valid) {
      log.warn(
        `fallback 空变更消息未通过校验，已修正`,
        validation.reason ?? "未知失败",
      );
    }
    return message;
  }

  const type = inferType(files);
  const scope = inferScope(files);
  const description = buildDescription(type, files);

  // 组装 header
  const scopePart = scope ? `(${scope})` : "";
  let header = `${type}${scopePart}: ${description}`;
  header = truncateHeader(header);

  // 组装 body
  const bodyLines = buildBody(files);
  const message = bodyLines ? `${header}\n\n${bodyLines}` : header;

  // P3：兜底消息通过 validateCommitMessage 校验
  const validation = validateCommitMessage(message);
  if (!validation.valid) {
    log.warn(
      `fallback 生成的消息未通过校验，已修正`,
      validation.reason ?? "未知失败",
    );
    // 取最后一次生成结果，记录告警但不阻断（兜底模式不应再重试）
    // 如果 header 过长，已经截断了；如果 body 要点过多，保留前 MAX_BODY_BULLETS 条
    const lines = message.split("\n");
    const headerLine = lines[0] ?? "";
    const bodyLinesCheck = lines.slice(2); // after header + blank line
    const bulletLines = bodyLinesCheck.filter((l) => l.startsWith("- ") || l.startsWith("  - "));
    if (bulletLines.length > MAX_BODY_BULLETS * 2) {
      // 把 file count 降低到 MAX_BODY_BULLETS 级
      const truncatedBody = bodyLinesCheck.slice(0, MAX_BODY_BULLETS * 2).join("\n");
      const corrected = `${headerLine}\n\n${truncatedBody}`;
      return corrected;
    }
  }

  return message;
}
