import { describe, expect, test } from "bun:test";
import {
  createSidebarGroup,
  moveWorktreeInSidebar,
  normalizeSidebarGroups,
  type SidebarWorktreeGroup,
} from "../src/lib/sidebar-groups";

describe("sidebar worktree groups", () => {
  test("creates a new group when one worktree is held over another", () => {
    const result = createSidebarGroup(
      {
        groups: [],
        orderedWorktreePaths: ["alpha", "beta", "gamma"],
      },
      "gamma",
      "beta",
      () => "group-1"
    );

    expect(result.orderedWorktreePaths).toEqual(["alpha", "beta", "gamma"]);
    expect(result.groupId).toBe("group-1");
    expect(result.groups).toEqual<SidebarWorktreeGroup[]>([
      {
        id: "group-1",
        name: "New group",
        worktreePaths: ["beta", "gamma"],
      },
    ]);
  });

  test("keeps a dragged worktree grouped when reordering inside the same group", () => {
    const result = moveWorktreeInSidebar(
      {
        groups: [
          {
            id: "group-1",
            name: "Roadmap",
            worktreePaths: ["alpha", "beta", "gamma"],
          },
        ],
        orderedWorktreePaths: ["alpha", "beta", "gamma", "delta"],
      },
      {
        sourceWorktreePath: "gamma",
        targetWorktreePath: "alpha",
        position: "before",
      }
    );

    expect(result.orderedWorktreePaths).toEqual(["gamma", "alpha", "beta", "delta"]);
    expect(result.groups).toEqual<SidebarWorktreeGroup[]>([
      {
        id: "group-1",
        name: "Roadmap",
        worktreePaths: ["gamma", "alpha", "beta"],
      },
    ]);
  });

  test("keeps a one-item group when another worktree moves out", () => {
    const result = moveWorktreeInSidebar(
      {
        groups: [
          {
            id: "group-1",
            name: "Review",
            worktreePaths: ["alpha", "beta"],
          },
        ],
        orderedWorktreePaths: ["alpha", "beta", "gamma"],
      },
      {
        sourceWorktreePath: "beta",
        targetWorktreePath: "gamma",
        position: "after",
      }
    );

    expect(result.orderedWorktreePaths).toEqual(["alpha", "gamma", "beta"]);
    expect(result.groups).toEqual<SidebarWorktreeGroup[]>([
      {
        id: "group-1",
        name: "Review",
        worktreePaths: ["alpha"],
      },
    ]);
  });

  test("drops a worktree into an existing group", () => {
    const result = moveWorktreeInSidebar(
      {
        groups: [
          {
            id: "group-1",
            name: "Queued",
            worktreePaths: ["alpha", "beta"],
          },
        ],
        orderedWorktreePaths: ["alpha", "beta", "gamma"],
      },
      {
        sourceWorktreePath: "gamma",
        targetGroupId: "group-1",
        position: "inside",
      }
    );

    expect(result.orderedWorktreePaths).toEqual(["alpha", "beta", "gamma"]);
    expect(result.groups).toEqual<SidebarWorktreeGroup[]>([
      {
        id: "group-1",
        name: "Queued",
        worktreePaths: ["alpha", "beta", "gamma"],
      },
    ]);
  });

  test("moves a worktree from one group into another", () => {
    const result = moveWorktreeInSidebar(
      {
        groups: [
          { id: "group-1", name: "First", worktreePaths: ["alpha", "beta"] },
          { id: "group-2", name: "Second", worktreePaths: ["gamma"] },
        ],
        orderedWorktreePaths: ["alpha", "beta", "gamma"],
      },
      {
        sourceWorktreePath: "beta",
        targetGroupId: "group-2",
        position: "inside",
      },
    );

    expect(result.groups).toEqual<SidebarWorktreeGroup[]>([
      { id: "group-1", name: "First", worktreePaths: ["alpha"] },
      { id: "group-2", name: "Second", worktreePaths: ["gamma", "beta"] },
    ]);
  });

  test("normalizes away invalid groups and preserves one-item groups", () => {
    const result = normalizeSidebarGroups(
      [
        {
          id: "group-1",
          name: "  ",
          worktreePaths: ["alpha", "alpha", "missing"],
        },
        {
          id: "group-2",
          name: "Valid",
          worktreePaths: ["beta", "gamma"],
        },
      ],
      ["alpha", "beta", "gamma"],
      ["gamma", "beta", "alpha"]
    );

    expect(result).toEqual<SidebarWorktreeGroup[]>([
      {
        id: "group-1",
        name: "New group",
        worktreePaths: ["alpha"],
      },
      {
        id: "group-2",
        name: "Valid",
        worktreePaths: ["gamma", "beta"],
      },
    ]);
  });
});
