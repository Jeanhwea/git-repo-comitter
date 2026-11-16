/**
 * 提交流程门禁回归测试（W2）。
 *
 * 无论消息来自正常生成、分批合并、P1 规则化还是 P2 降级，
 * 进入 gitCommit 前都必须经过 validateCommitMessage；不合规时必须中止且不写 git。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  batched: vi.fn(),
  fallback: vi.fn(),
  gitCommit: vi.fn(),
  isGitRepo: vi.fn(() => true),
}));

vi.mock("@/infra/git/changes", () => ({
  getStagedChangeSet: vi.fn(() => ({
    files: [],
    newFiles: [],
    binaryFiles: [],
    hasStagedChanges: true,
    hasUnstagedChanges: false,
  })),
  hasStagedChanges: vi.fn(() => true),
  hasUnstagedChanges: vi.fn(() => true),
  readNewFileContents: vi.fn(() => []),
}));
vi.mock("@/infra/git/diff", () => ({
  getStagedDiff: vi.fn(() => "diff --git a/x.ts b/x.ts\n+1"),
}));
vi.mock("@/infra/git/repo", () => ({
  isGitRepo: state.isGitRepo,
  gitAddAll: vi.fn(),
  gitCommit: state.gitCommit,
}));
vi.mock("@/domain/commit-message/batch", () => ({
  generateCommitMessageBatched: state.batched,
}));
vi.mock("@/domain/commit-message/fallback", () => ({
  generateFallbackMessage: state.fallback,
}));
vi.mock("@/domain/file-review/reviewer", () => ({
  reviewNewFiles: vi.fn(),
}));

import type { AppConfig } from "@/config/types";
import { executeCommit } from "@/domain/commit-flow";
import { GrcError } from "@/shared/errors";

const BAD = "这不是一条合规的提交信息。";
const GOOD = "chore: 统一提交前校验门禁";

function config(apiKey = "sk-test"): AppConfig {
  return {
    apiKey,
    endpoint: "https://example.com/v1",
    llm: {
      model: "m",
      temperature: 0,
      maxInputTokens: 100,
      maxOutputTokens: 100,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.isGitRepo.mockReturnValue(true);
  state.batched.mockResolvedValue({ message: GOOD, batchCount: 1 });
  state.fallback.mockReturnValue(GOOD);
});

async function expectBlocked(request: Parameters<typeof executeCommit>[0]) {
  await expect(executeCommit(request)).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  expect(state.gitCommit).not.toHaveBeenCalled();
}

describe("executeCommit 的提交前硬门禁", () => {
  test("正常生成路径：不合规消息不得写入 git", async () => {
    state.batched.mockResolvedValue({ message: BAD, batchCount: 1 });
    await expectBlocked({ config: config() });
  });

  test("分批合并路径：不合规消息不得写入 git", async () => {
    state.batched.mockResolvedValue({ message: BAD, batchCount: 3 });
    await expectBlocked({ config: config() });
  });

  test("P2 降级路径：兜底消息不合规时不得写入 git", async () => {
    state.batched.mockRejectedValue(new GrcError("LLM 挂了", "LLM_FAILED"));
    state.fallback.mockReturnValue(BAD);
    await expectBlocked({ config: config() });
  });

  test("P1 无 API Key 路径：兜底消息不合规时不得写入 git", async () => {
    state.fallback.mockReturnValue(BAD);
    await expectBlocked({ config: config("") });
    expect(state.batched).not.toHaveBeenCalled();
  });

  test("合规消息可以通过门禁并写入 git", async () => {
    const outcome = await executeCommit({ config: config() });
    expect(outcome.committed).toBe(true);
    expect(state.gitCommit).toHaveBeenCalledTimes(1);
    expect(state.gitCommit.mock.calls[0]?.[0]).toBe(GOOD);
  });

  test("非 git 仓库在任何路径都先行中止", async () => {
    state.isGitRepo.mockReturnValue(false);
    await expect(executeCommit({ config: config("") })).rejects.toMatchObject({
      code: "NOT_GIT_REPO",
    });
    expect(state.gitCommit).not.toHaveBeenCalled();
  });
});
