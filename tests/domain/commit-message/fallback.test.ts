/**
 * 兜底提交消息回归测试（W2）。
 *
 * 原题：buildBody 按「分组行 + 每文件一行」计数，10 个文件的普通变更就会
 * 命中 C3，而旧逻辑只把「已修正」写进日志、消息原样返回。这里把实证过的
 * 四种变更规模固定成参数化用例，并覆盖标题超长、scope 非法与退化失败路径。
 */
import { describe, expect, test, vi } from "vitest";

const probe = vi.hoisted(() => ({
  mode: "real" as "real" | "fail-full" | "fail-all",
}));

vi.mock("@/domain/commit-message/checker", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/domain/commit-message/checker")>();
  return {
    ...actual,
    validateCommitMessage: (message: string) => {
      if (
        probe.mode === "fail-all" ||
        (probe.mode === "fail-full" && message.includes("\n\n"))
      ) {
        return { valid: false, reason: "[TEST] 强制校验失败" };
      }
      return actual.validateCommitMessage(message);
    },
  };
});

import type { ChangeSet, FileChange, ChangeStatus } from "@/infra/git/changes";
import { MAX_HEADER_LENGTH } from "@/shared/commit-limits";
import { GrcError } from "@/shared/errors";
import { validateCommitMessage } from "@/domain/commit-message/checker";

import { generateFallbackMessage } from "@/domain/commit-message/fallback";

function files(added: number, modified: number): FileChange[] {
  const result: FileChange[] = [];
  for (let i = 0; i < added; i++) {
    result.push({
      path: `src/module-${i}/file-${i}.ts`,
      status: "added",
      isBinary: false,
      additions: 10,
      deletions: 0,
    });
  }
  for (let i = 0; i < modified; i++) {
    result.push({
      path: `src/module-${i}/changed-${i}.ts`,
      status: "modified",
      isBinary: false,
      additions: 3,
      deletions: 2,
    });
  }
  return result;
}

function changeSet(items: FileChange[]): ChangeSet {
  return {
    files: items,
    newFiles: items.filter((f) => f.status === "added"),
    binaryFiles: items.filter((f) => f.isBinary),
    hasStagedChanges: items.length > 0,
    hasUnstagedChanges: false,
  };
}

function assertCompliant(message: string): void {
  const result = validateCommitMessage(message);
  expect(
    result.valid,
    `${result.valid ? "" : (result as { reason?: string }).reason}\n---\n${message}`,
  ).toBe(true);
  const bullets = message
    .split("\n")
    .filter((line) => line.trimStart().startsWith("- "));
  expect(bullets.length).toBeLessThanOrEqual(3);
}

describe("generateFallbackMessage", () => {
  test.each([
    [3, 2],
    [5, 5],
    [8, 8],
    [12, 12],
  ] as const)("新增 %i + 修改 %i 均产出合规消息", (added, modified) => {
    probe.mode = "real";
    assertCompliant(generateFallbackMessage(changeSet(files(added, modified))));
  });

  test("空变更产出合规消息", () => {
    probe.mode = "real";
    assertCompliant(generateFallbackMessage(changeSet([])));
  });

  test("重命名与子模块变更进入正文并产出合规消息", () => {
    probe.mode = "real";
    const items: FileChange[] = [
      {
        path: "docs/new.md",
        oldPath: "docs/old.md",
        status: "renamed",
        isBinary: false,
        additions: 2,
        deletions: 1,
      },
      {
        path: "vendor/lib",
        status: "submodule",
        isBinary: false,
        additions: 0,
        deletions: 0,
      },
    ];
    const message = generateFallbackMessage(changeSet(items));
    expect(message).toContain("docs/old.md → docs/new.md");
    expect(message).toContain("子模块变更");
    assertCompliant(message);
  });

  test("超长文件列表被汇总到同一条要点且不超行宽", () => {
    probe.mode = "real";
    const items: FileChange[] = Array.from({ length: 12 }, (_, i) => ({
      path: `src/very/deep/module/with/a/long/name/file-number-${i}.ts`,
      status: "added" as ChangeStatus,
      isBinary: false,
      additions: 1,
      deletions: 0,
    }));
    const message = generateFallbackMessage(changeSet(items));
    assertCompliant(message);
    for (const line of message.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(118);
    }
  });

  test("中文或大写一级目录不会产生非法 scope", () => {
    probe.mode = "real";
    const items: FileChange[] = [
      {
        path: "Docs_zh/guide.md",
        status: "added",
        isBinary: false,
        additions: 1,
        deletions: 0,
      },
    ];
    const message = generateFallbackMessage(changeSet(items));
    expect(message.split("\n")[0]).not.toContain("(Docs_zh)");
    assertCompliant(message);
  });

  test("超长标题截断后仍以合规字符收尾", () => {
    probe.mode = "real";
    const items: FileChange[] = [
      {
        path: `src/${"very-long-directory-name-".repeat(4)}/file.ts`,
        status: "modified",
        isBinary: false,
        additions: 1,
        deletions: 0,
      },
    ];
    const message = generateFallbackMessage(changeSet(items));
    const header = message.split("\n")[0] ?? "";
    expect(header.length).toBeLessThanOrEqual(MAX_HEADER_LENGTH);
    expect(header.endsWith(".")).toBe(false);
    assertCompliant(message);
  });

  test("完整消息校验失败时退化为仅标题", () => {
    probe.mode = "fail-full";
    const message = generateFallbackMessage(changeSet(files(1, 1)));
    expect(message).not.toContain("\n\n");
    expect(validateCommitMessage(message).valid).toBe(true);
  });

  test("连最小标题都无法校验通过时中止而不是返回坏消息", () => {
    probe.mode = "fail-all";
    expect(() => generateFallbackMessage(changeSet(files(1, 1)))).toThrowError(
      GrcError,
    );
    try {
      generateFallbackMessage(changeSet(files(1, 1)));
    } catch (err) {
      expect((err as GrcError).code).toBe("VALIDATION_FAILED");
    }
  });
});
