export function getNavigableSessions<T extends { name: string }>(
  repositories: readonly { worktrees: readonly T[] }[],
): T[] {
  return repositories.flatMap(({ worktrees }) =>
    worktrees.filter(({ name }) => name !== "main"),
  );
}

export function orderSessionsByPath<T extends { path: string }>(
  sessions: readonly T[],
  orderedPaths: readonly string[],
): T[] {
  const sessionsByPath = new Map(sessions.map((session) => [session.path, session]));
  return orderedPaths.flatMap((path) => {
    const session = sessionsByPath.get(path);
    return session ? [session] : [];
  });
}

export function recordRecentWorktreePath(
  recentPaths: readonly string[],
  worktreePath: string,
  limit = 10,
): string[] {
  return [worktreePath, ...recentPaths.filter((path) => path !== worktreePath)].slice(0, limit);
}

export function pruneRecentWorktreePaths(
  recentPaths: readonly string[],
  availablePaths: ReadonlySet<string>,
): string[] {
  return recentPaths
    .filter((path, index) => availablePaths.has(path) && recentPaths.indexOf(path) === index)
    .slice(0, 10);
}

export function orderRecentSessions<T extends { path: string }>(
  sessions: readonly T[],
  recentPaths: readonly string[],
): T[] {
  const sessionsByPath = new Map(sessions.map((session) => [session.path, session]));
  const recent = recentPaths.flatMap((path) => {
    const session = sessionsByPath.get(path);
    return session ? [session] : [];
  });
  const recentSet = new Set(recent.map((session) => session.path));
  return [...recent, ...sessions.filter((session) => !recentSet.has(session.path))];
}

export function cycleItems<T>(
  sessions: readonly T[],
  current: T | null,
  delta: number,
): T | null {
  if (sessions.length === 0) return null;
  const currentIndex = current === null ? -1 : sessions.indexOf(current);
  const index = currentIndex === -1 ? (delta > 0 ? -1 : 0) : currentIndex;
  return sessions[(index + delta + sessions.length) % sessions.length];
}
