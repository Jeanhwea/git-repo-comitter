/**
 * 应用层 —— 审查门禁的 CLI 装配。
 *
 * F05：提问与否决属于终端交互，不应出现在领域层（I06 的 P1 已把提问上移到 app，
 * 本次随抽库进一步收敛）：领域层只保留 reviewNewFiles 的纯审查能力，
 * 这里负责把「LLM 审查结论」翻译成终端问答，供 CLI 注入 commit 流程。
 */
import type { ReviewResult } from "@/domain/file-review/reviewer";
import { question } from "@/shared/input";
import { createLogger } from "@/shared/logger";

const log = createLogger("review");

/** 确认继续提交的回答（大小写不敏感，其余一律视为拒绝）。 */
const CONFIRM_WORDS = new Set(["y", "yes"]);

/**
 * 生成供 CommitRequest.onReview 使用的裁决回调：打印可疑文件并向用户提问。
 * 库调用方不传 onReview 即完全非交互，因此终端问答只存在于本文件。
 */
export function createCliReviewHandler(): (
  result: ReviewResult,
) => Promise<boolean> {
  return async (result) => {
    console.log("LLM 审查发现以下文件疑似不需要提交：");
    for (const file of result.suspiciousFiles) {
      console.log(`  - ${file}`);
    }
    console.log(`原因：${result.reason}`);

    const answer = (await question("是否继续提交？(y/N): "))
      .trim()
      .toLowerCase();
    if (!CONFIRM_WORDS.has(answer)) {
      log.debug("用户否决，取消提交");
      return false;
    }
    return true;
  };
}
