import { describe, expect, test } from "bun:test";
import {
  applyReviewerOverrides,
  clearAcknowledgedReviewerOverrides,
  type ReviewerOverrides,
} from "../src/components/RightPanel/reviewer-state";

describe("reviewer state", () => {
  test("keeps a successful add through a stale poll until GitHub acknowledges it", () => {
    const overrides: ReviewerOverrides = {
      alice: { reviewer: "alice", requested: true },
    };

    expect(applyReviewerOverrides([], overrides)).toEqual(["alice"]);
    expect(clearAcknowledgedReviewerOverrides(overrides, [])).toEqual(overrides);
    expect(clearAcknowledgedReviewerOverrides(overrides, ["alice"])).toEqual({});
  });

  test("keeps a successful removal through a stale poll until GitHub acknowledges it", () => {
    const overrides: ReviewerOverrides = {
      alice: { reviewer: "alice", requested: false },
    };

    expect(applyReviewerOverrides(["alice"], overrides)).toEqual([]);
    expect(clearAcknowledgedReviewerOverrides(overrides, ["alice"])).toEqual(overrides);
    expect(clearAcknowledgedReviewerOverrides(overrides, [])).toEqual({});
  });
});
