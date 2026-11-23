/**
 * infra/git/changes 的采集测试（I08 W6 后续）。
 *
 * 通过注入假 git 执行器，构造 --raw -z / --numstat -z / --name-status -z 输出，
 * 锁定 added / modified / deleted / renamed / submodule / binary 六类建模，
 * 以及审查门禁对 rename 新路径的覆盖。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getStagedChangeSet, readNewFileContents } from "@/infra/git/changes";
import { setGitExecutor, type GitExecOptions } from "@/infra/git/executor";

type Responder = (args: string[], opts?: GitExecOptions) => string;

/** 依据子命令把调用分发到对应的伪造输出。 */
function useGit(responders: {
  raw?: Responder;
  numstat?: Responder;
  nameStatus?: Responder;
  show?: Responder;
  status?: Responder;
}): void {
  setGitExecutor({
    exec: vi.fn((args: string[], opts?: GitExecOptions) => {
      const [cmd, sub] = args;
      if (cmd === "diff" && sub === "--cached" && args.includes("--raw")) {
        return responders.raw?.(args, opts) ?? "";
      }
      if (cmd === "diff" && sub === "--cached" && args.includes("--numstat")) {
        return responders.numstat?.(args, opts) ?? "";
      }
      if (cmd === "diff" && args.includes("--name-status")) {
        return responders.nameStatus?.(args, opts) ?? "";
      }
      if (cmd === "show") return responders.show?.(args, opts) ?? "";
      if (cmd === "status") return responders.status?.(args, opts) ?? "";
      return "";
    }),
  });
}

/** 组装一条 --raw -z 记录。 */
function rawEntry(
  oldMode: string,
  newMode: string,
  code: string,
  paths: string[],
): string {
  return `:${oldMode} ${newMode} 0000000 1111111 ${code}\0${paths.join("\0")}\0`;
}

/** 组装一条 --numstat -z 记录。 */
function numstatEntry(add: string, del: string, paths: string[]): string {
  if (paths.length === 1) return `${add}\t${del}\t${paths[0]}\0`;
  return `${add}\t${del}\t\0${paths.join("\0")}\0`;
}

beforeEach(() => {
  // 每个用例重新注入，避免执行器状态跨用例残留。
  useGit({});
});

describe("getStagedChangeSet 采集建模", () => {
  test("常规增删改按 raw 状态码产出，不再一律 modified", () => {
    useGit({
      raw: () =>
        rawEntry("000000", "100644", "A", ["src/new.ts"]) +
        rawEntry("100644", "100644", "M", ["src/mod.ts"]) +
        rawEntry("100644", "000000", "D", ["src/gone.ts"]),
      numstat: () =>
        numstatEntry("10", "0", ["src/new.ts"]) +
        numstatEntry("3", "2", ["src/mod.ts"]) +
        numstatEntry("0", "5", ["src/gone.ts"]),
    });

    const set = getStagedChangeSet();
    expect(set.files).toHaveLength(3);
    expect(set.files.find((f) => f.path === "src/new.ts")).toMatchObject({
      status: "added",
      additions: 10,
      deletions: 0,
    });
    expect(set.files.find((f) => f.path === "src/mod.ts")).toMatchObject({
      status: "modified",
      additions: 3,
      deletions: 2,
    });
    expect(set.files.find((f) => f.path === "src/gone.ts")?.status).toBe(
      "deleted",
    );
    expect(set.newFiles.map((f) => f.path)).toEqual(["src/new.ts"]);
    expect(set.deletedFiles.map((f) => f.path)).toEqual(["src/gone.ts"]);
    expect(set.hasStagedChanges).toBe(true);
  });

  test("重命名保留 oldPath，状态为 renamed，行数来自 numstat", () => {
    useGit({
      raw: () =>
        rawEntry("100644", "100644", "R091", ["docs/old.md", "docs/new.md"]),
      numstat: () => numstatEntry("2", "1", ["docs/old.md", "docs/new.md"]),
    });

    const set = getStagedChangeSet();
    expect(set.files).toHaveLength(1);
    const renamed = set.files[0];
    expect(renamed).toMatchObject({
      path: "docs/new.md",
      oldPath: "docs/old.md",
      status: "renamed",
      additions: 2,
      deletions: 1,
    });
    expect(set.renamedFiles).toHaveLength(1);
    expect(set.newFiles).toHaveLength(0);
  });

  test("gitlink（mode 160000）建模为 submodule，且不计入二进制", () => {
    useGit({
      raw: () =>
        rawEntry("160000", "160000", "M", ["vendor/lib"]) +
        rawEntry("100644", "100644", "A", ["assets/logo.png"]),
      numstat: () =>
        numstatEntry("1", "1", ["vendor/lib"]) +
        numstatEntry("-", "-", ["assets/logo.png"]),
    });

    const set = getStagedChangeSet();
    const sub = set.files.find((f) => f.path === "vendor/lib");
    expect(sub).toMatchObject({ status: "submodule", isBinary: false });
    expect(set.submoduleFiles.map((f) => f.path)).toEqual(["vendor/lib"]);
    // 二进制仍按 numstat 的 "-" 判定，与子模块分开。
    expect(set.binaryFiles.map((f) => f.path)).toEqual(["assets/logo.png"]);
  });

  test("无暂存变更时返回空集合与 hasStagedChanges=false", () => {
    useGit({ raw: () => "", numstat: () => "" });
    const set = getStagedChangeSet();
    expect(set.files).toEqual([]);
    expect(set.hasStagedChanges).toBe(false);
  });
});

describe("readNewFileContents 审查范围", () => {
  test("纳入 rename 的新路径，并读取其暂存内容", () => {
    useGit({
      nameStatus: (args) =>
        args.includes("--cached")
          ? `A\0src/add.ts\0R100\0src/old.ts\0src/moved.ts\0`
          : "",
      show: (args) => {
        const spec = args[1] ?? "";
        return spec === ":src/add.ts"
          ? "add"
          : spec === ":src/moved.ts"
            ? "moved"
            : "";
      },
      raw: () => "",
      numstat: () => "",
    });

    const contents = readNewFileContents(true);
    expect(contents.map((c) => c.path)).toEqual(["src/add.ts", "src/moved.ts"]);
    expect(contents.find((c) => c.path === "src/moved.ts")?.content).toBe(
      "moved",
    );
  });

  test("含空白字符的路径不被截断", () => {
    useGit({
      nameStatus: () => `A\0src/hello world.ts\0`,
      show: () => "content",
      raw: () => "",
      numstat: () => "",
    });
    expect(readNewFileContents(true).map((c) => c.path)).toEqual([
      "src/hello world.ts",
    ]);
  });
});
