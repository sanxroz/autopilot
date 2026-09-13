import { describe, expect, test } from "bun:test";
import { shouldShowMergedStatus } from "../src/components/right-panel-toolbar-state";

describe("RightPanelToolbar", () => {
  test("keeps merged feedback visible after GitHub reports the merge", () => {
    expect(shouldShowMergedStatus(true, false)).toBe(true);
    expect(shouldShowMergedStatus(undefined, true)).toBe(true);
    expect(shouldShowMergedStatus(undefined, false)).toBe(false);
  });
});
