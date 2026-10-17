import { describe, expect, test } from "bun:test";
import { getAgentNotification } from "../src/lib/agent-notifications";

const event = (status: "running" | "completed" | "waiting_input" | "error") => ({
  status,
  agent: "claude",
  worktreePath: "/repos/autopilot/.worktrees/922-lisbon",
});

describe("getAgentNotification", () => {
  test("uses friendly copy with agent and session name", () => {
    expect(getAgentNotification("running", event("completed"), false)).toEqual({
      title: "Claude finished",
      body: "922-lisbon is ready to review",
    });
    expect(getAgentNotification("running", event("waiting_input"), false)?.title).toBe("Claude needs your input");
    expect(getAgentNotification("running", event("error"), false)?.title).toBe("Claude hit an error");
  });
  test("falls back when the agent is unknown", () => {
    expect(getAgentNotification("running", { ...event("completed"), agent: undefined }, false)?.title).toBe("Your agent finished");
  });
  test("stays silent when focused, repeated, or not a notifiable state", () => {
    expect(getAgentNotification("running", event("completed"), true)).toBeNull();
    expect(getAgentNotification("completed", event("completed"), false)).toBeNull();
    expect(getAgentNotification(undefined, event("running"), false)).toBeNull();
  });
});
