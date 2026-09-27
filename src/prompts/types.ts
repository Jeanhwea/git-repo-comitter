import type OpenAI from "openai";

export type ChatMsg = OpenAI.ChatCompletionMessageParam;

/**
 * 一条提示词的完整定义。
 * - system：已组合好的系统提示词文本（由 blocks/* 复用片段拼成）。
 * - buildUser：可选，把不可信的业务数据包裹进 XML 标记并构造 user 消息。
 * - repairHint：可选，校验失败时的修复提示构造器。
 */
export interface PromptDefinition {
  id: string;
  system: string;
  buildUser?: (data: unknown) => string;
  repairHint?: (reason: string) => string;
}

/**
 * 统一消息组装：消除 generator / batch / reviewer 里重复的
 * [{ role: "system" }, { role: "user" }] 样板。
 */
export function buildMessages(
  p: PromptDefinition,
  data?: unknown,
): ChatMsg[] {
  const msgs: ChatMsg[] = [{ role: "system", content: p.system }];
  if (p.buildUser) {
    msgs.push({ role: "user", content: p.buildUser(data) });
  }
  return msgs;
}
