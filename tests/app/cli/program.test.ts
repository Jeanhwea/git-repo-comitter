import { beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({
  runCommit: vi.fn(() => Promise.resolve()),
  runInit: vi.fn(() => Promise.resolve()),
  setLogLevel: vi.fn(),
}));

vi.mock("@/app/commands/commit", () => ({ runCommit: commands.runCommit }));

vi.mock("@/app/commands/init", () => ({ runInit: commands.runInit }));

vi.mock("@/shared/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/logger")>();
  return { ...actual, setLogLevel: commands.setLogLevel };
});

import { createProgram, runCli } from "@/app/cli/program";

function parse(...args: string[]): void {
  createProgram().parse(["node", "grc", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("app/cli/program", () => {
  it("默认提交：不跳过暂存、Hook 与审查门禁", () => {
    parse();

    expect(commands.runCommit).toHaveBeenCalledWith({
      stagedOnly: false,
      noVerify: false,
      review: true,
    });
    expect(commands.runInit).not.toHaveBeenCalled();
  });

  it("负向选项反转成正向参数传给下游", () => {
    parse("--staged-only", "-n", "--no-review");

    expect(commands.runCommit).toHaveBeenCalledWith({
      stagedOnly: true,
      noVerify: true,
      review: false,
    });
  });

  it("init 子命令只调用初始化流程", () => {
    parse("init");

    expect(commands.runInit).toHaveBeenCalledTimes(1);
    expect(commands.runCommit).not.toHaveBeenCalled();
  });

  it("日志级别按 trace > debug/verbose > info 收敛", () => {
    parse("--trace");
    expect(commands.setLogLevel).toHaveBeenCalledWith("trace");

    commands.setLogLevel.mockClear();
    parse("--debug");
    expect(commands.setLogLevel).toHaveBeenCalledWith("debug");

    commands.setLogLevel.mockClear();
    parse("-V");
    expect(commands.setLogLevel).toHaveBeenCalledWith("debug");

    commands.setLogLevel.mockClear();
    parse();
    expect(commands.setLogLevel).toHaveBeenCalledWith("info");
  });

  it("runCli 每次调用都使用独立的程序实例", () => {
    runCli(["node", "grc", "--staged-only"]);
    runCli(["node", "grc"]);

    expect(commands.runCommit).toHaveBeenNthCalledWith(1, {
      stagedOnly: true,
      noVerify: false,
      review: true,
    });
    expect(commands.runCommit).toHaveBeenNthCalledWith(2, {
      stagedOnly: false,
      noVerify: false,
      review: true,
    });
  });
});
