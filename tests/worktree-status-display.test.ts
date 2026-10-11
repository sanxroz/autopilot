import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorktreeItem } from "../src/components/WorktreeItem";
import { getWorktreeActivityDisplay } from "../src/lib/worktree-status";
import type { AgentRunState } from "../src/types";

const run: AgentRunState = {
  worktreePath: "/repo/worktree",
  sessionId: "session-1",
  status: "running",
  startedAt: 1000,
  lastEventAt: 60_000,
};

describe("worktree activity display", () => {
  test("uses lifecycle state before process fallback", () => {
    expect(getWorktreeActivityDisplay({ ...run, status: "error", error: "Boom" }, "agent_running", 180_000)).toMatchObject({
      label: "Agent error",
      icon: "error",
      title: "Boom · 2m ago",
    });
    expect(getWorktreeActivityDisplay({ ...run, status: "waiting_input" }, "none", 60_000)).toMatchObject({
      label: "Waiting for input",
      colorClass: "text-semantic-warning",
      icon: "ready",
    });
    expect(getWorktreeActivityDisplay({ ...run, status: "completed" }, "none", 60_000)).toMatchObject({
      label: "Agent finished",
      icon: "completed",
    });
  });

  test("starting and running agents use the running color", () => {
    for (const status of ["starting", "running"] as const) {
      expect(getWorktreeActivityDisplay({ ...run, status }, "agent_running")).toMatchObject({
        label: "Agent running",
        colorClass: "text-semantic-success",
        icon: "spinner",
      });
    }
  });

  test("always labels a polled agent", () => {
    expect(getWorktreeActivityDisplay(undefined, "agent_running")).toMatchObject({
      label: "Agent open",
      colorClass: "text-semantic-success",
      icon: "dot",
    });
    expect(getWorktreeActivityDisplay({
      ...run,
      sessionId: `process-${run.worktreePath}`,
      label: "Agent process detected",
    }, "agent_running")).toMatchObject({
      label: "Agent open",
      colorClass: "text-semantic-success",
      icon: "dot",
    });
    expect(getWorktreeActivityDisplay(undefined, "none")).toBeNull();
  });


  test("row shows agent status only through the indicator and its accessible label", () => {
    // SAFETY: the row only reads number, state, merged, draft, and requested_reviewers from prStatus.
    const render = (prStatus: unknown) => renderToStaticMarkup(createElement(WorktreeItem, {
      name: "kingston",
      branch: "feature",
      lastModified: Date.now(),
      prStatus,
      processStatus: "agent_running",
      agentRunState: { ...run, status: "waiting_input" },
      isActive: false,
      onSelect: () => {},
      onDelete: () => {},
    } as Parameters<typeof WorktreeItem>[0]));

    for (const html of [render(null), render({ number: 7, state: "open", merged: false, draft: false, requested_reviewers: [] })]) {
      expect(html).toContain('aria-label="feature workspace, Waiting for input');
      expect(html).toContain("text-semantic-warning");
      expect(html).not.toContain(">Waiting for input<");
    }
  });
});
