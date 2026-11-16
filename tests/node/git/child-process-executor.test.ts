/**
 * Node git 执行器回归测试（W4）：git 失败必须包装成稳定的 GrcError，
 * hook 拒绝使用 HOOK_BLOCKED，stderr 必须进入错误消息便于诊断。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("child_process", () => ({ execFileSync: vi.fn() }));

import { execFileSync } from "child_process";

import { GrcError } from "@/shared/errors";
import { childProcessExecutor } from "@/node/git/child-process-executor";

const exec = execFileSync as unknown as ReturnType<typeof vi.fn>;

function failure(stderr: string): Error {
  return Object.assign(new Error("Command failed"), {
    stderr: Buffer.from(stderr),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("childProcessExecutor", () => {
  test("成功时原样返回 stdout", () => {
    exec.mockReturnValue(" 变更内容");
    expect(childProcessExecutor.exec(["diff"])).toBe(" 变更内容");
  });

  test("普通 git 失败包装为 GIT_FAILED 并带上 stderr", () => {
    exec.mockImplementation(() => {
      throw failure("fatal: not a git repository");
    });
    try {
      childProcessExecutor.exec(["status"]);
      throw new Error("应当抛出 GrcError");
    } catch (err) {
      expect(err).toBeInstanceOf(GrcError);
      expect((err as GrcError).code).toBe("GIT_FAILED");
      expect((err as GrcError).message).toContain("not a git repository");
    }
  });

  test("hook 拒绝包装为 HOOK_BLOCKED", () => {
    exec.mockImplementation(() => {
      throw failure("pre-commit hook failed with code 1");
    });
    try {
      childProcessExecutor.exec(["commit", "-m", "x"]);
      throw new Error("应当抛出 GrcError");
    } catch (err) {
      expect((err as GrcError).code).toBe("HOOK_BLOCKED");
    }
  });

  test("allowFailure 时失败返回空串", () => {
    exec.mockImplementation(() => {
      throw failure("fatal: bad revision");
    });
    expect(
      childProcessExecutor.exec(["rev-parse"], { allowFailure: true }),
    ).toBe("");
  });
});
