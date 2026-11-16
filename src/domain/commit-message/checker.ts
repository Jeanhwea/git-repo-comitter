/**
 * 领域层 —— 提交信息格式校验。
 *
 * 规则编号与 docs/feat/F04.提交消息严格校验.md 的 A~F 组一一对应：
 * 失败原因带编号回显，便于模型按编号逐条修正。一次调用返回全部命中项，
 * 避免「改一条、下次又命中另一条」的返工循环把重试次数耗光。
 *
 * 规则判定按职责拆到 checker/ 子目录：
 * - patterns.ts：共享正则与工具；
 * - header.ts：A 组标题校验；
 * - body.ts：B/C/D/E 组正文与载体校验。
 * 本文件只负责编排，仍是唯一公共入口（scripts/check-rules.mjs 读取本目录全体文件对账）。
 *
 * 校验失败时的修复提示文本已归入 prompts/commit-message/repair.ts（I06 的 P4）。
 */
import type { ValidationOutcome } from "@/shared/validation";

import { validateBody } from "./checker/body";
import { validateHeader } from "./checker/header";
import { snippet } from "./checker/patterns";

export function validateCommitMessage(
  message: string,
): ValidationOutcome<string> {
  // 部分模型输出 CRLF，分析前统一为 LF；返回值保持模型原样输出。
  const normalized = message.replace(/\r\n/g, "\n");
  if (normalized.trim() === "") {
    return { valid: false, reason: "[E6] 提交信息为空，禁止提交空内容" };
  }

  const reasons: string[] = [];

  if (normalized !== normalized.trim()) {
    reasons.push(
      "[E1] 输出的第一行必须是标题行且结尾禁止追加空行，禁止以空行或空白开头",
    );
  }

  const lines = normalized.trim().split("\n");
  const header = lines[0] ?? "";
  const { reasons: headerReasons, fields } = validateHeader(header);
  reasons.push(...headerReasons);

  const fence = lines.find((line) => line.trim().startsWith("```"));
  if (fence) {
    reasons.push(
      `[E1] 输出必须是纯文本，禁止使用代码块围栏（发现行："${snippet(fence)}"）`,
    );
  }

  const bodyLines = lines.slice(1);
  // C1 的判据：正文非空但第二行不是空行。
  const hasContentAfterHeader = bodyLines.some((line) => line.trim() !== "");
  const missingBlankLine =
    hasContentAfterHeader && (bodyLines[0] ?? "").trim() !== "";
  const { reasons: bodyReasons, warnings } = validateBody(
    lines,
    bodyLines,
    fields,
    missingBlankLine,
  );
  reasons.push(...bodyReasons);

  if (reasons.length > 0) {
    return { valid: false, reason: reasons.join("\n  ") };
  }
  return {
    valid: true,
    value: message,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
