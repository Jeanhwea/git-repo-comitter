import type OpenAI from "openai";

type ChatMessage = OpenAI.ChatCompletionMessageParam;

/**
 * 一条提示词的完整定义。
 * - system：已组合好的系统提示词文本（由 blocks/* 复用片段拼成）。
 * - buildUser：可选，把不可信的业务数据包裹进 XML 标记并构造 user 消息。
 * - repairHint：可选，校验失败时的修复提示构造器。
 *
 * TInput 描述构造 user 消息所需的业务数据（如 diff 字符串、草稿列表），
 * 使 buildMessages 能在编译期校验调用方传参，
 * 从而免去各提示词里 `data as X` 的类型断言。
 */
export interface PromptDefinition<TInput = void> {
  id: string;
  system: string;
  buildUser?: (data: TInput) => string;
  repairHint?: (reason: string) => string;
}

/**
 * 统一消息组装：消除 generator / batch / reviewer 里重复的
 * [{ role: "system" }, { role: "user" }] 样板。
 */
export function buildMessages<TInput>(
  p: PromptDefinition<TInput>,
  data: TInput,
): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: p.system }];
  if (p.buildUser) {
    msgs.push({ role: "user", content: p.buildUser(data) });
  }
  return msgs;
}
