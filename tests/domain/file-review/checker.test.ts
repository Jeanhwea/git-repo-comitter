import { describe, expect, test } from "vitest";

import { validateReviewResult } from "@/domain/file-review/checker";
import { REVIEW_REASON_MAX_LENGTH } from "@/shared/limits";

describe("审查结果校验", () => {
  const payload = (reason: string) =>
    JSON.stringify({ shouldCommit: true, suspiciousFiles: [], reason });

  test("reason 上限来自 shared/limits", () => {
    const atLimit = validateReviewResult(
      payload("说".repeat(REVIEW_REASON_MAX_LENGTH)),
    );
    const overLimit = validateReviewResult(
      payload("说".repeat(REVIEW_REASON_MAX_LENGTH + 1)),
    );
    expect(atLimit.valid).toBe(true);
    expect(overLimit.valid).toBe(false);
  });
});
