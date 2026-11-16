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
import { GrcError } from "@/shared/errors";
import { MAX_BODY_LINE_LENGTH, MAX_HEADER_LENGTH } from "@/shared/limits";
import { createLogger } from "@/shared/logger";
import { displayWidth, truncateToWidth } from "@/shared/text";

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
 * @param files - 文件变更列表，用于推断 type
 */
function inferType(files: FileChange[]): string {
  const added = files.filter((f) => f.status === "added");
  const modified = files.filter((f) => f.status === "modified");
  const deleted = files.filter((f) => f.status === "deleted");
  const allFiles = files.map((f) => f.path);

  // 1. test
  if (added.some((f) => /\.(spec|test)\.(ts|tsx|js|jsx)$/i.test(f.path))) {
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

/** 与 checker 的 scope 规则一致；W3 会把该正则收敛到 shared。 */
const VALID_SCOPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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
  // 一级目录可能含有大写、下划线或中文（如 I08、docs_zh），直接写入会被 A3 拦截。
  return VALID_SCOPE.test(best) ? best : undefined;
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
/*  body 要点生成 — 按操作类型归并为「每组一条」要点                      */
/* ------------------------------------------------------------------ */

/**
 * 按主题归并生成正文。原先「分组行 + 每文件一行」的写法会把文件数直接变成
 * 要点数，10 个文件的普通变更就会命中 C3；这里每组固定一条要点，
 * 文件名内联到同一行并在行宽处收尾，使要点数恒为 3 组以内。
 * @param files - 暂存区变更文件列表。
 */
function buildBody(files: FileChange[]): string {
  const groups: Array<{ label: string; items: FileChange[] }> = [
    {
      label: "新增文件",
      items: files.filter((f) => f.status === "added"),
    },
    {
      label: "修改文件",
      items: files.filter((f) => f.status === "modified"),
    },
    {
      label: "删除文件",
      items: files.filter((f) => f.status === "deleted"),
    },
  ];

  const lines: string[] = [];
  for (const { label, items } of groups) {
    if (items.length === 0) continue;
    const names = items.map((f) => {
      if (f.isBinary) return `${f.path} [二进制]`;
      if (label === "修改文件") {
        return `${f.path} (+${f.additions}/-${f.deletions})`;
      }
      return f.path;
    });
    const prefix = `- ${label}（${items.length}）：`;
    let line = prefix;
    for (const name of names) {
      const separator = line === prefix ? "" : "、";
      if (displayWidth(line + separator + name) > MAX_BODY_LINE_LENGTH) {
        line += `${separator}…`;
        break;
      }
      line += separator + name;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  标题行字符串截断辅助                                                */
/* ------------------------------------------------------------------ */

/**
 * 对 description 部分做硬截断以保证整个 header 不超过 MAX_HEADER_LENGTH。
 * 截断位置尽量选择词边界，并在末尾追加省略号。
 * @param header - 待截断的 header 字符串
 */
function truncateHeader(header: string): string {
  if (displayWidth(header) <= MAX_HEADER_LENGTH) return header;
  // 用省略号而非三个点：checker 的 A6 禁止标题以句号结尾，"..." 会被判违规。
  return truncateToWidth(header, MAX_HEADER_LENGTH - 1) + "…";
}

/* ------------------------------------------------------------------ */
/*  public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * 确保即将返回的消息合规：先校验完整消息，不合规则退化为仅标题，
 * 仍不合规则中止——绝不把「声称已修正」但实际未修正的消息交出去。
 * @param header - 已构造好的标题行，用于退化路径。
 * @param message - 完整提交消息。
 */
function ensureCompliant(header: string, message: string): string {
  const full = validateCommitMessage(message);
  if (full.valid) return message;

  log.warn(
    `兜底消息未通过校验，退化为仅标题。原因：${full.reason ?? "未知失败"}`,
  );
  const minimal = validateCommitMessage(header);
  if (minimal.valid) return header;

  throw new GrcError(
    `兜底消息与最小标题均未通过校验，已中止提交（未写入 git）。\n${minimal.reason ?? "未知失败"}`,
    "VALIDATION_FAILED",
  );
}

/**
 * 规则化生成一条合规的 Conventional Commits 提交消息。
 * 不需要 LLM，完全基于 ChangeSet 的文件变更特征推断。
 * @param changeSet - 暂存区变更集（来自 getStagedChangeSet）。
 * @returns 合规的提交消息字符串；无法生成合规消息时抛 VALIDATION_FAILED。
 */
export function generateFallbackMessage(changeSet: ChangeSet): string {
  const { files } = changeSet;

  // 空变更处理
  if (files.length === 0) {
    return ensureCompliant("chore: 无实质变更", "chore: 无实质变更");
  }

  const type = inferType(files);
  const scope = inferScope(files);
  const description = buildDescription(type, files);

  // 组装 header
  const scopePart = scope ? `(${scope})` : "";
  const header = truncateHeader(`${type}${scopePart}: ${description}`);

  // 组装 body
  const bodyLines = buildBody(files);
  const message = bodyLines ? `${header}\n\n${bodyLines}` : header;

  return ensureCompliant(header, message);
}
