/**
 * 文件 diff 模块 —— 分块层。
 *
 * 按文件把 diff 切成块、折叠超出 token 预算的巨型块、再按上限分组为批次，
 * 使超长变更能以多批次方式喂给 LLM 而不撑爆上下文。
 */
import { estimateTokens } from "@/shared/tokens";

interface DiffBlock {
  filePath: string;
  content: string;
  estimatedTokens: number;
}

interface DiffBatch {
  blocks: DiffBlock[];
  content: string;
  estimatedTokens: number;
}

/** 附加说明段（如二进制清单）的伪文件路径，用于独立成块。 */
const SECTION_PATH = "（附加说明段）";

/**
 * 按 `diff --git` 把 diff 切成块；`=== xxx ===` 说明段独立成块，
 * 避免二进制清单被并进最后一个文件块后随折叠一起消失（W6）。
 * @param diff - 完整暂存 diff 文本。
 */
export function parseDiffBlocks(diff: string): DiffBlock[] {
  const lines = diff.split("\n");
  const blocks: DiffBlock[] = [];
  let sectionLines: string[] = [];
  let blockLines: string[] = [];
  let blockPath = "";

  const pushBlock = (filePath: string, contentLines: string[]) => {
    if (contentLines.length === 0) return;
    const content = contentLines.join("\n");
    blocks.push({
      filePath,
      content,
      estimatedTokens: estimateTokens(content),
    });
  };

  const flushSection = () => {
    pushBlock(SECTION_PATH, sectionLines);
    sectionLines = [];
  };
  const flush = () => {
    pushBlock(blockPath, blockLines);
    blockLines = [];
  };

  for (const line of lines) {
    const fileHeader = line.match(/^diff --git a\/(.+?) b\//);
    // 段头尾部没有空格（如「=== 二进制文件变更（仅显示文件名）===」），不能要求尾随空格。
    const sectionHeader = line.match(/^===.+===$/);

    if (fileHeader) {
      flushSection();
      flush();
      blockPath = fileHeader[1] ?? "";
      blockLines.push(line);
      continue;
    }
    if (sectionHeader) {
      flushSection();
      flush();
      sectionLines.push(line);
      continue;
    }
    if (sectionLines.length > 0) {
      sectionLines.push(line);
      continue;
    }
    blockLines.push(line);
  }

  flushSection();
  flush();
  return blocks;
}

/** 折叠摘要保留的首尾行数。 */
const SUMMARY_HEAD_LINES = 6;
const SUMMARY_TAIL_LINES = 6;

/**
 * 构造超长块的摘要：保留文件头与尾部片段，并标注省略行数，
 * 让模型至少能看到变更的开头与结尾，而不是只剩一句「已省略」。
 * @param block - 待折叠的 diff 块。
 * @param maxTokens - 摘要的 token 上限。
 */
function summarizeBlock(block: DiffBlock, maxTokens: number): DiffBlock {
  const placeholder = `文件 ${block.filePath} 的变更内容过大，已省略具体差异，仅记录文件名变更。`;
  const lines = block.content.split("\n");
  if (lines.length <= SUMMARY_HEAD_LINES + SUMMARY_TAIL_LINES + 2) {
    return {
      filePath: block.filePath,
      content: placeholder,
      estimatedTokens: estimateTokens(placeholder),
    };
  }

  let head = SUMMARY_HEAD_LINES;
  let tail = SUMMARY_TAIL_LINES;
  const build = (): string =>
    [
      ...lines.slice(0, head),
      `...（已省略 ${lines.length - head - tail} 行，仅保留首尾片段，具体改动未纳入分析）...`,
      ...lines.slice(lines.length - tail),
    ].join("\n");

  let content = build();
  while (estimateTokens(content) > maxTokens && (head > 0 || tail > 0)) {
    if (head >= tail) head--;
    else tail--;
    content = build();
  }
  if (estimateTokens(content) > maxTokens) content = placeholder;
  return {
    filePath: block.filePath,
    content,
    estimatedTokens: estimateTokens(content),
  };
}

/**
 * 把超出 token 预算的块折叠成带首尾片段的摘要，
 * 避免单个巨型文件把整份 diff 撑爆上下文，同时保留可追溯的改动线索。
 * @param blocks - 切出来的 diff 块，未超预算的原样返回。
 * @param maxTokens - 单块 token 上限，超出的块被折叠为摘要。
 */
export function collapseOversizedBlocks(
  blocks: DiffBlock[],
  maxTokens: number,
): DiffBlock[] {
  return blocks.map((block) =>
    block.estimatedTokens <= maxTokens
      ? block
      : summarizeBlock(block, maxTokens),
  );
}

export function groupIntoBatches(
  blocks: DiffBlock[],
  maxTokens: number,
): DiffBatch[] {
  if (blocks.length === 0) return [];

  const batches: DiffBatch[] = [];
  let currentBlocks: DiffBlock[] = [];
  let currentTokens = 0;

  const flushBatch = () => {
    if (currentBlocks.length === 0) return;
    const content = currentBlocks.map((b) => b.content).join("\n");
    batches.push({
      blocks: currentBlocks,
      content,
      estimatedTokens: currentTokens,
    });
    currentBlocks = [];
    currentTokens = 0;
  };

  for (const block of blocks) {
    // 已有内容且放不下时才切批：保证不产出空批次，
    // 单个块本身超限时独占一批（切无可切，交由上层折叠处理）。
    if (
      currentBlocks.length > 0 &&
      currentTokens + block.estimatedTokens > maxTokens
    ) {
      flushBatch();
    }
    currentBlocks.push(block);
    currentTokens += block.estimatedTokens;
  }

  flushBatch();
  return batches;
}
