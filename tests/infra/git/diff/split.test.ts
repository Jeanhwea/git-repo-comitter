import { describe, expect, test } from "vitest";

import {
  collapseOversizedBlocks,
  parseDiffBlocks,
} from "@/infra/git/diff/split";
import { estimateTokens } from "@/shared/tokens";

describe("parseDiffBlocks", () => {
  test("二进制文件清单独立成块，不并入最后一个文件块", () => {
    const diff =
      "diff --git a/a.ts b/a.ts\n+第一行\n=== 二进制文件变更（仅显示文件名）===\n  - logo.png";
    const blocks = parseDiffBlocks(diff);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.content).not.toContain("logo.png");
    expect(blocks[1]?.content).toContain("logo.png");
  });
});

describe("collapseOversizedBlocks", () => {
  test("超长块折叠后保留首尾片段并标注省略行数", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `+line-${i}`);
    const content = `diff --git a/big.ts b/big.ts\n${lines.join("\n")}`;
    const block = {
      filePath: "big.ts",
      content,
      estimatedTokens: estimateTokens(content),
    };
    const [collapsed] = collapseOversizedBlocks([block], 60);
    expect(collapsed?.content).toContain("+line-0");
    expect(collapsed?.content).toContain("+line-39");
    expect(collapsed?.content).toContain("已省略");
    expect(estimateTokens(collapsed?.content ?? "")).toBeLessThanOrEqual(60);
  });
});
