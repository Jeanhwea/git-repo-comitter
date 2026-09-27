import { estimateTokens } from "@/shared/tokens";

/**
 * 文件 diff 模块 —— 分块层。
 * 从 domain/commit-message/split.ts 迁入：按文件把 diff 切成块、对超大块折叠、再按 token 上限分组。
 */

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

export function parseDiffBlocks(diff: string): DiffBlock[] {
  const lines = diff.split("\n");
  const blocks: DiffBlock[] = [];
  // 段头（如二进制清单）先缓存，等确定归属的块后再落盘。
  let pendingHeader = "";
  let blockLines: string[] = [];
  let blockPath = "";

  const flush = () => {
    if (blockLines.length === 0) return;
    const content = blockLines.join("\n");
    blocks.push({
      filePath: blockPath,
      content,
      estimatedTokens: estimateTokens(content),
    });
    blockLines = [];
  };

  const flushHeader = () => {
    if (!pendingHeader) return;
    blockLines.push(pendingHeader);
    pendingHeader = "";
  };

  for (const line of lines) {
    const fileHeader = line.match(/^diff --git a\/(.+?) b\//);
    const sectionHeader = line.match(/^=== .+ ===$/);

    if (fileHeader) {
      flush();
      blockPath = fileHeader[1];
      flushHeader();
      blockLines.push(line);
      continue;
    }
    if (sectionHeader) {
      flushHeader();
      pendingHeader = line;
      continue;
    }
    flushHeader();
    blockLines.push(line);
  }

  flush();
  return blocks;
}

/**
 * 把超出 token 预算的块折叠成「只留文件名」的占位说明，
 * 避免单个巨型文件把整份 diff 撑爆上下文。
 */
export function collapseOversizedBlocks(
  blocks: DiffBlock[],
  maxTokens: number,
): DiffBlock[] {
  return blocks.map((block) => {
    if (block.estimatedTokens <= maxTokens) return block;
    const content = `文件 ${block.filePath} 的变更内容过大，已省略具体差异，仅记录文件名变更。`;
    return {
      filePath: block.filePath,
      content,
      estimatedTokens: estimateTokens(content),
    };
  });
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
