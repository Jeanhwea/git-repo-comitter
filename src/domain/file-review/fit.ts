/**
 * 领域层 —— 审查输入的 token 预算适配。
 *
 * 新增文件审查的 user 消息由全部新增文件的全文拼成，缺少预算控制时，
 * 一个超大的文档或生成文件就能把请求顶出模型上下文。本模块在保留所有文件路径的前提下，
 * 按预算裁剪文件内容：文件越多，单份内容分配到的额度越少；小文件不会被白白压缩。
 */
import { TRUNCATED_CONTENT_NOTICE, wrapNewFiles } from "@/prompts";
import type { NewFileContent } from "@/prompts";
import { estimateTokens } from "@/shared/tokens";

/** 裁剪后保留片段中，开头与结尾各自所占的比例（开头略多，结尾用于覆盖文件末尾）。 */
const HEAD_FRACTION = 0.6;

/** 组装失败时的最多重算次数，抵消 size 属性位数变化带来的估算误差。 */
const MAX_REFIT_ATTEMPTS = 3;

/**
 * 找出内容中不超过指定 token 预算的最长前缀。
 * @param content - 原始内容。
 * @param budget - 该前缀可用的 token 预算。
 */
function longestFittingPrefix(content: string, budget: number): number {
  if (estimateTokens(content) <= budget) return content.length;
  let low = 0;
  let high = content.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTokens(content.slice(0, middle)) <= budget) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/**
 * 找出内容中不超过指定 token 预算的最长后缀。
 * @param content - 原始内容。
 * @param budget - 该后缀可用的 token 预算。
 */
function longestFittingSuffix(content: string, budget: number): number {
  if (estimateTokens(content) <= budget) return content.length;
  let low = 0;
  let high = content.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTokens(content.slice(content.length - middle)) <= budget) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/**
 * 将单份文件内容裁剪到指定 token 预算内，保留开头与结尾片段并插入裁剪说明。
 * @param content - 原始文件内容。
 * @param budget - 该文件的可用 token 预算。
 */
function truncateContent(content: string, budget: number): string {
  if (estimateTokens(content) <= budget) return content;

  const noticeTokens = estimateTokens(TRUNCATED_CONTENT_NOTICE);
  if (budget <= noticeTokens) return "";

  const availableTokens = budget - noticeTokens;
  const headBudget = Math.floor(availableTokens * HEAD_FRACTION);
  const tailBudget = availableTokens - headBudget;
  const headLength = longestFittingPrefix(content, headBudget);
  const tailLength = longestFittingSuffix(content, tailBudget);

  // 片段重叠说明整份内容其实放得下，只留开头即可，避免首尾重复输出。
  if (headLength + tailLength >= content.length) {
    const singleLength = longestFittingPrefix(content, availableTokens);
    return `${content.slice(0, singleLength)}${TRUNCATED_CONTENT_NOTICE}`;
  }

  return [
    content.slice(0, headLength),
    TRUNCATED_CONTENT_NOTICE,
    content.slice(content.length - tailLength),
  ].join("");
}

/**
 * 按「小文件先满足、剩余额度平分」的方式为每个文件分配内容预算。
 * @param contentTokenCounts - 各文件原始内容的 token 估算值。
 * @param totalBudget - 所有文件内容共享的 token 预算。
 */
function allocateContentBudgets(
  contentTokenCounts: number[],
  totalBudget: number,
): number[] {
  const budgets = new Array<number>(contentTokenCounts.length).fill(0);
  let remaining = Math.max(0, totalBudget);
  let active = contentTokenCounts.map((_, index) => index);

  while (active.length > 0 && remaining > 0) {
    const share = remaining / active.length;
    const overflowed: number[] = [];
    let consumed = 0;

    for (const index of active) {
      const needed = contentTokenCounts[index] ?? 0;
      if (needed <= share) {
        budgets[index] = needed;
        consumed += needed;
      } else {
        overflowed.push(index);
      }
    }

    // 没有文件能被完整满足时，把剩余额度平分给仍活跃的文件后结束。
    if (overflowed.length === active.length) {
      for (const index of overflowed) {
        budgets[index] = Math.floor(share);
      }
      break;
    }

    remaining -= consumed;
    active = overflowed;
  }

  return budgets;
}

/**
 * 把新增文件列表压缩到 token 预算内：路径一律保留，内容按需要裁剪。
 * @param files - 原始新增文件列表。
 * @param limit - 审查请求 user 消息的 token 上限。
 */
export function fitFilesWithinBudget(
  files: NewFileContent[],
  limit: number,
): NewFileContent[] {
  if (files.length === 0) return [];

  const containerTokens = estimateTokens("<new_files>\n</new_files>");
  const wrapperTokens = files.reduce((total, file) => {
    const sizeDigits = String(file.content.length).length;
    return (
      total +
      estimateTokens(`<file path="${file.path}" size="${sizeDigits}">\n\n</file>`)
    );
  }, 0);

  let contentBudget = Math.max(0, limit - containerTokens - wrapperTokens);
  let fitted = fitWithBudget(files, contentBudget);

  for (
    let attempt = 0;
    attempt < MAX_REFIT_ATTEMPTS &&
    estimateTokens(wrapNewFiles(fitted)) > limit;
    attempt++
  ) {
    contentBudget = Math.floor(contentBudget * 0.95);
    fitted = fitWithBudget(files, contentBudget);
  }

  return fitted;
}

/**
 * 按给定内容预算实际执行一次裁剪。
 * @param files - 原始新增文件列表。
 * @param contentBudget - 所有文件内容共享的 token 预算。
 */
function fitWithBudget(
  files: NewFileContent[],
  contentBudget: number,
): NewFileContent[] {
  const budgets = allocateContentBudgets(
    files.map((file) => estimateTokens(file.content)),
    contentBudget,
  );
  return files.map((file, index) => ({
    path: file.path,
    content: truncateContent(file.content, budgets[index] ?? 0),
  }));
}
