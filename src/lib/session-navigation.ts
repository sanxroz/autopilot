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
