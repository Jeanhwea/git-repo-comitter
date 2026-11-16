import { describe, expect, test } from "vitest";

import { COMMIT_RULES } from "@/shared/commit-rules";
import { commitMessageRepairHint } from "@/prompts/commit-message/repair";

describe("修复提示", () => {
  test("回灌清单包含全部 L1 / L2 编号", () => {
    const hint = commitMessageRepairHint("[A1] type 不合法");
    for (const rule of COMMIT_RULES.filter((r) => r.level !== "L3")) {
      expect(hint, rule.id).toContain(`[${rule.id}]`);
    }
  });

  test("原样回显本次失败原因", () => {
    expect(commitMessageRepairHint("[C3] 要点过多")).toContain("[C3] 要点过多");
  });
});
