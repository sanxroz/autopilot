export interface SidebarWorktreeGroup {
  readonly id: string;
  readonly name: string;
  readonly worktreePaths: readonly string[];
}

export interface SidebarWorktreeDrop {
  readonly sourceWorktreePath: string;
  readonly position: "before" | "after" | "inside";
  readonly targetWorktreePath?: string;
  readonly targetGroupId?: string;
}

export const DEFAULT_SIDEBAR_GROUP_NAME = "New group";

interface SidebarGroupingState {
  readonly groups: readonly SidebarWorktreeGroup[];
  readonly orderedWorktreePaths: readonly string[];
}

function removePathFromGroups(
  groups: readonly SidebarWorktreeGroup[],
  worktreePath: string
): SidebarWorktreeGroup[] {
  return groups
    .map((group) => ({
      ...group,
      worktreePaths: group.worktreePaths.filter((path) => path !== worktreePath),
    }))
    .filter((group) => group.worktreePaths.length >= 2);
}

function insertPath(
  paths: readonly string[],
  worktreePath: string,
  index: number
): string[] {
  const nextPaths = paths.filter((path) => path !== worktreePath);
  const safeIndex = Math.max(0, Math.min(index, nextPaths.length));
  nextPaths.splice(safeIndex, 0, worktreePath);
  return nextPaths;
}

function insertPathRelativeToTarget(
  paths: readonly string[],
  worktreePath: string,
  targetWorktreePath: string,
  position: "before" | "after"
): string[] {
  const nextPaths = paths.filter((path) => path !== worktreePath);
  const targetIndex = nextPaths.indexOf(targetWorktreePath);

  if (targetIndex === -1) {
    return nextPaths;
  }

  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  nextPaths.splice(insertIndex, 0, worktreePath);
  return nextPaths;
}

function sortGroupPaths(
  worktreePaths: readonly string[],
  orderIndex: ReadonlyMap<string, number>
): string[] {
  return [...worktreePaths].sort(
    (a, b) =>
      (orderIndex.get(a) ?? Number.POSITIVE_INFINITY) -
      (orderIndex.get(b) ?? Number.POSITIVE_INFINITY)
  );
}

export function normalizeSidebarGroups(
  groups: readonly SidebarWorktreeGroup[] | undefined,
  validWorktreePaths: readonly string[],
  orderedWorktreePaths: readonly string[]
): SidebarWorktreeGroup[] {
  if (!groups?.length) {
    return [];
  }

  const validPathSet = new Set(validWorktreePaths);
  const orderIndex = new Map(
    orderedWorktreePaths.map((path, index) => [path, index] as const)
  );
  const claimedPaths = new Set<string>();
  const normalizedGroups: SidebarWorktreeGroup[] = [];

  for (const group of groups) {
    const uniquePaths: string[] = [];

    for (const path of group.worktreePaths) {
      if (!validPathSet.has(path) || claimedPaths.has(path)) {
        continue;
      }
      claimedPaths.add(path);
      uniquePaths.push(path);
    }

    if (uniquePaths.length < 2) {
      continue;
    }

    normalizedGroups.push({
      id: group.id,
      name: group.name.trim() || DEFAULT_SIDEBAR_GROUP_NAME,
      worktreePaths: sortGroupPaths(uniquePaths, orderIndex),
    });
  }

  return normalizedGroups;
}

export function findSidebarGroupByWorktreePath(
  groups: readonly SidebarWorktreeGroup[],
  worktreePath: string
): SidebarWorktreeGroup | null {
  return (
    groups.find((group) => group.worktreePaths.includes(worktreePath)) ?? null
  );
}

export function createSidebarGroup(
  state: SidebarGroupingState,
  sourceWorktreePath: string,
  targetWorktreePath: string,
  createGroupId: () => string
): { groups: SidebarWorktreeGroup[]; orderedWorktreePaths: string[]; groupId: string } {
  const nextOrder = insertPathRelativeToTarget(
    state.orderedWorktreePaths,
    sourceWorktreePath,
    targetWorktreePath,
    "after"
  );
  const baseGroups = removePathFromGroups(state.groups, sourceWorktreePath);
  const targetGroup = findSidebarGroupByWorktreePath(baseGroups, targetWorktreePath);

  if (targetGroup) {
    const nextGroups = baseGroups.map((group) => {
      if (group.id !== targetGroup.id) {
        return group;
      }

      return {
        ...group,
        worktreePaths: insertPathRelativeToTarget(
          group.worktreePaths,
          sourceWorktreePath,
          targetWorktreePath,
          "after"
        ),
      };
    });

    return {
      groups: normalizeSidebarGroups(
        nextGroups,
        nextOrder,
        nextOrder
      ),
      orderedWorktreePaths: nextOrder,
      groupId: targetGroup.id,
    };
  }

  const groupId = createGroupId();
  const nextGroups = [
    ...baseGroups,
    {
      id: groupId,
      name: DEFAULT_SIDEBAR_GROUP_NAME,
      worktreePaths: [targetWorktreePath, sourceWorktreePath],
    },
  ];

  return {
    groups: normalizeSidebarGroups(nextGroups, nextOrder, nextOrder),
    orderedWorktreePaths: nextOrder,
    groupId,
  };
}

export function moveWorktreeInSidebar(
  state: SidebarGroupingState,
  drop: SidebarWorktreeDrop
): { groups: SidebarWorktreeGroup[]; orderedWorktreePaths: string[] } {
  const sourceGroup = findSidebarGroupByWorktreePath(
    state.groups,
    drop.sourceWorktreePath
  );
  const targetGroupFromWorktree = drop.targetWorktreePath
    ? findSidebarGroupByWorktreePath(state.groups, drop.targetWorktreePath)
    : null;
  let nextOrder = [...state.orderedWorktreePaths];

  if (drop.position === "inside") {
    const targetGroup = state.groups.find(
      (group) => group.id === drop.targetGroupId
    );
    const anchorPath =
      targetGroup?.worktreePaths[targetGroup.worktreePaths.length - 1];

    nextOrder = anchorPath
      ? insertPathRelativeToTarget(
          nextOrder,
          drop.sourceWorktreePath,
          anchorPath,
          "after"
        )
      : insertPath(nextOrder, drop.sourceWorktreePath, nextOrder.length);
  } else if (drop.targetWorktreePath) {
    nextOrder = insertPathRelativeToTarget(
      nextOrder,
      drop.sourceWorktreePath,
      drop.targetWorktreePath,
      drop.position
    );
  }

  const groupsWithoutSource = removePathFromGroups(
    state.groups,
    drop.sourceWorktreePath
  );
  let nextGroups = groupsWithoutSource;

  if (drop.position === "inside" && drop.targetGroupId) {
    nextGroups = groupsWithoutSource.map((group) => {
      if (group.id !== drop.targetGroupId) {
        return group;
      }

      return {
        ...group,
        worktreePaths: [...group.worktreePaths, drop.sourceWorktreePath],
      };
    });
  } else if (
    drop.position !== "inside" &&
    sourceGroup &&
    targetGroupFromWorktree &&
    sourceGroup.id === targetGroupFromWorktree.id &&
    drop.targetWorktreePath
  ) {
    const targetWorktreePath = drop.targetWorktreePath;
    const position: "before" | "after" = drop.position;
    nextGroups = groupsWithoutSource.map((group) => {
      if (group.id !== sourceGroup.id) {
        return group;
      }

      return {
        ...group,
        worktreePaths: insertPathRelativeToTarget(
          group.worktreePaths,
          drop.sourceWorktreePath,
          targetWorktreePath,
          position
        ),
      };
    });
  }

  return {
    groups: normalizeSidebarGroups(nextGroups, nextOrder, nextOrder),
    orderedWorktreePaths: nextOrder,
  };
}
