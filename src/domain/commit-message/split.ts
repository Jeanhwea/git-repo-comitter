import { estimateTokens } from "../../infra/llm/tokens";

export interface DiffBlock {
  filePath: string;
  content: string;
  estimatedTokens: number;
}

export interface DiffBatch {
  blocks: DiffBlock[];
  content: string;
  estimatedTokens: number;
}

export function parseDiffBlocks(diff: string): DiffBlock[] {
  const lines = diff.split("\n");
  const blocks: DiffBlock[] = [];
  let currentHeader = "";
  let currentLines: string[] = [];
  let currentFile = "";

  const flush = () => {
    if (currentLines.length === 0) return;
    const content = currentLines.join("\n");
    blocks.push({
      filePath: currentFile,
      content,
      estimatedTokens: estimateTokens(content),
    });
    currentLines = [];
  };

  for (const line of lines) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\//);
    const sectionMatch = line.match(/^=== .+ ===$/);

    if (diffMatch) {
      flush();
      currentFile = diffMatch[1];
      if (currentHeader) {
        currentLines.push(currentHeader);
        currentHeader = "";
      }
      currentLines.push(line);
    } else if (sectionMatch) {
      currentHeader = line;
    } else {
      if (currentHeader && currentLines.length === 0) {
        currentLines.push(currentHeader);
        currentHeader = "";
      }
      currentLines.push(line);
    }
  }

  flush();
  return blocks;
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
    if (currentTokens + block.estimatedTokens <= maxTokens) {
      currentBlocks.push(block);
      currentTokens += block.estimatedTokens;
    } else {
      flushBatch();
      currentBlocks.push(block);
      currentTokens = block.estimatedTokens;
    }
  }

  flushBatch();
  return batches;
}
