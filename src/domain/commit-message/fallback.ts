/**
 * 领域层 —— LLM 不可用时的规则化提交消息生成。
 *
 * 兜底生成不依赖 LLM，完全通过文件变更特征（新增/修改/删除、文件扩展名、目录结构）
 * 推断 type / scope / description / body，保证在以下两种场景下仍能产出合规的提交消息：
 *
 * 1. 用户未配置 LLM（apiKey 为空）
 * 2. LLM 调用连续失败（VALIDATION_FAILED / LLM_FAILED）
 *
 * 推断逻辑已拆到 fallback-infer.ts（W6），本文件只负责消息组装与合规退化。
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
import { buildDescription, inferScope, inferType } from "./fallback-infer";

const log = createLogger("fallback");

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
