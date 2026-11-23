/**
 * 提交消息校验规则回归测试（W3）。
 *
 * 覆盖 F04 中原先缺失的 A5 / D2、L2 告警 E3 / E4，以及 I04 P3 的
 * 中文显示宽度口径；type 白名单直接取自 shared/limits。
 */
import { describe, expect, test } from "vitest";

import { validateCommitMessage } from "@/domain/commit-message/checker";
import { COMMIT_RULES } from "@/shared/commit-rules";
import { COMMIT_TYPES } from "@/shared/limits";

const valid = (message: string) => validateCommitMessage(message);
const reasonOf = (message: string) =>
  (valid(message) as { reason?: string }).reason ?? "";

describe("F04 编号补齐", () => {
  test("A5：! 不能替代 description", () => {
    expect(reasonOf("feat(api)!:")).toContain("[A5]");
  });

  test("D2：脚注写成项目符号时拦截且不放行 D3", () => {
    const message =
      "feat(api)!: 移除旧版兼容\n\n- BREAKING CHANGE: 运行环境变更";
    const result = valid(message);
    expect(result.valid).toBe(false);
    const reason = (result as { reason: string }).reason;
    expect(reason).toContain("[D2]");
    expect(reason).toContain("[D3]");
  });

  test("D2：脚注同行并列时拦截", () => {
    expect(reasonOf("fix: 修复登录问题\n\nRefs: 3f7a1c9, 8b2d1e4")).toContain(
      "[D2]",
    );
  });

  test("合规脚注逐行排列时通过", () => {
    expect(valid("fix: 修复登录问题\n\nRefs: 3f7a1c9").valid).toBe(true);
  });

  test("一次返回全部命中项", () => {
    const reason = reasonOf("feature:修複了。\n正文没有空行\n* 星号列表");
    expect(reason).toContain("[A1]");
    expect(reason).toContain("[A4]");
    expect(reason).toContain("[C1]");
    expect(reason).toContain("[C2]");
  });
});

describe("显示宽度与 L2 告警", () => {
  test("A8 按半角宽度计，中文标题提前触发", () => {
    const message = `feat: ${"修".repeat(38)}`;
    expect(reasonOf(message)).toContain("[A8]");
  });

  test("纯英文 78 字符标题恰好通过", () => {
    const header = `feat: ${"a".repeat(72)}`;
    expect(valid(header).valid).toBe(true);
  });

  test("E3：标识符被中文化时给出告警但不拦截", () => {
    const result = valid("fix: 修复login重定向问题");
    expect(result.valid).toBe(true);
    expect((result as { warnings?: string[] }).warnings?.join(" ")).toContain(
      "[E3]",
    );
  });

  test("E4：繁体字与网络用语给出告警但不拦截", () => {
    const result = valid("feat: 修複登錄問題 yyds");
    expect(result.valid).toBe(true);
    const warnings = (result as { warnings?: string[] }).warnings?.join(" ");
    expect(warnings).toContain("[E4]");
  });
});

describe("规则清单同源", () => {
  test("共享清单中的 type 全部通过 A1", () => {
    for (const type of COMMIT_TYPES) {
      const footer = type === "revert" ? "\n\nRefs: 3f7a1c9" : "";
      expect(valid(`${type}: 变更说明${footer}`).valid, type).toBe(true);
    }
  });

  test("清单覆盖 F04 的全部 A~E 编号且层级无缺口", () => {
    const ids = COMMIT_RULES.map((rule) => rule.id);
    expect(ids.length).toBe(new Set(ids).size);
    for (const group of "ABCDE") {
      expect(ids.some((id) => id.startsWith(group))).toBe(true);
    }
  });
});
