/**
 * domain/file-review/fit 的单元测试：审查输入在 token 预算内的裁剪行为。
 */
import { describe, expect, test } from "vitest";

import { fitFilesWithinBudget } from "@/domain/file-review/fit";
import { TRUNCATED_CONTENT_NOTICE, wrapNewFiles } from "@/prompts";
import { estimateTokens } from "@/shared/tokens";

describe("fitFilesWithinBudget", () => {
  test("未超预算时内容原样保留", () => {
    const files = [
      { path: "src/a.ts", content: "const name = 'a';\n" },
      { path: "README.md", content: "# 项目说明\n" },
    ];
    const result = fitFilesWithinBudget(files, 1000);
    expect(result).toEqual(files);
  });

  test("超预算时保留全部文件路径，并把总内容压进预算", () => {
    const largeContent = "中文内容".repeat(4000);
    const files = [
      { path: "docs/巨大文档.md", content: largeContent },
      { path: "src/小文件.ts", content: "export const value = 1;\n" },
    ];
    const limit = 1200;
    const result = fitFilesWithinBudget(files, limit);

    expect(result.map((file) => file.path)).toEqual([
      "docs/巨大文档.md",
      "src/小文件.ts",
    ]);
    expect(result[0]?.content).not.toBe(largeContent);
    expect(result[0]?.content).toContain(TRUNCATED_CONTENT_NOTICE);
    expect(estimateTokens(wrapNewFiles(result))).toBeLessThanOrEqual(limit);
  });

  test("预算极小时仍返回路径占位，不抛出错误", () => {
    const result = fitFilesWithinBudget(
      [{ path: "docs/巨大文档.md", content: "很长的内容".repeat(1000) }],
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("docs/巨大文档.md");
  });

  test("空文件列表直接返回空数组", () => {
    expect(fitFilesWithinBudget([], 100)).toEqual([]);
  });
});
