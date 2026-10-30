/**
 * infra/git/executor 的单元测试：未装配执行器时的失败行为、注入实现的委托与选项透传，
 * 以及不同实现之间的热替换。
 */
import { describe, expect, test, vi } from "vitest";

import { GrcError } from "@/shared/errors";

import {
  execGit,
  setGitExecutor,
  type GitExecOptions,
  type GitExecutor,
} from "@/infra/git/executor";

describe("infra/git/executor (F07 执行器端口)", () => {
  test("未装配执行器时 execGit 抛 GrcError(GIT_FAILED)", () => {
    // 本文件是唯一导入 executor 的测试；vitest 按文件隔离模块，
    // 模块加载时 current 为 null —— 即浏览器 / WebView 未注入实现的初始状态。
    expect(() => execGit(["status"])).toThrow(GrcError);
    expect(() => execGit(["status"])).toThrowError(/未装配/);
    try {
      execGit(["status"]);
    } catch (e) {
      expect(e).toBeInstanceOf(GrcError);
      expect((e as GrcError).code).toBe("GIT_FAILED");
    }
  });

  test("setGitExecutor 注入后 execGit 委托给该实现", () => {
    const executor: GitExecutor = {
      exec: vi.fn(
        (args: string[], opts?: GitExecOptions) =>
          `called:${args.join(",")}:${opts?.cwd ?? ""}`,
      ),
    };
    setGitExecutor(executor);
    const out = execGit(["log", "--oneline"], { cwd: "/repo" });
    expect(out).toBe("called:log,--oneline:/repo");
    expect(executor.exec).toHaveBeenCalledWith(["log", "--oneline"], {
      cwd: "/repo",
    });
  });

  test("execGit 透传 allowFailure 等选项", () => {
    const executor: GitExecutor = { exec: vi.fn(() => "") };
    setGitExecutor(executor);
    execGit(["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
    expect(executor.exec).toHaveBeenCalledWith(
      ["rev-parse", "--is-inside-work-tree"],
      { allowFailure: true },
    );
  });

  test("不同实现可被热替换", () => {
    const a: GitExecutor = { exec: () => "A" };
    const b: GitExecutor = { exec: () => "B" };
    setGitExecutor(a);
    expect(execGit(["x"])).toBe("A");
    setGitExecutor(b);
    expect(execGit(["x"])).toBe("B");
  });
});
