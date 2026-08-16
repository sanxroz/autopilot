import { describe, expect, test } from "bun:test";
import {
  applyReviewerOverrides,
  buildReviewerOptions,
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

  test("keeps requested teams visible and identifies them separately from users", () => {
    const options = buildReviewerOptions(
      [{ identifier: "alice", display_name: "alice", avatar_url: "alice.png", kind: "user" }],
      ["alice", "acme/frontend"],
      ["acme/frontend"],
      "author",
    );

    expect(options.map(({ identifier }) => identifier)).toEqual(["acme/frontend", "alice"]);
    expect(options[0]).toMatchObject({ display_name: "frontend", kind: "team" });
  });
});
