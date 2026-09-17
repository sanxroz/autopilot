import { describe, expect, test } from "bun:test";
import { formatQuotaWindow, formatResetTime } from "../src/lib/agent-usage";

describe("agent usage display", () => {
  test("names Codex quota windows", () => {
    expect(formatQuotaWindow(300)).toBe("5-hour limit");
    expect(formatQuotaWindow(10_080)).toBe("Weekly limit");
    expect(formatQuotaWindow(2_880)).toBe("2-day limit");
  });

  test("formats nearby resets as relative time", () => {
    const now = Date.UTC(2026, 8, 16, 12);
    expect(formatResetTime((now + 45 * 60_000) / 1000, now)).toBe("Resets in 45m");
    expect(formatResetTime((now + 3 * 60 * 60_000) / 1000, now)).toBe("Resets in 3h");
  });
});
