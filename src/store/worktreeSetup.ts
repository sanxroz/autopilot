export function addWorktreeSetupName(
  worktreeSetupByRepoPath: Record<string, string[]>,
  repoPath: string,
  worktreeName: string
): Record<string, string[]> {
  const current = worktreeSetupByRepoPath[repoPath] ?? [];
  if (current.includes(worktreeName)) {
    return worktreeSetupByRepoPath;
  }

  return {
    ...worktreeSetupByRepoPath,
    [repoPath]: [...current, worktreeName],
  };
}

export function removeWorktreeSetupName(
  worktreeSetupByRepoPath: Record<string, string[]>,
  repoPath: string,
  worktreeName: string
): Record<string, string[]> {
  const current = worktreeSetupByRepoPath[repoPath];
  if (!current?.length) {
    return worktreeSetupByRepoPath;
  }

  const next = current.filter((name) => name !== worktreeName);
  if (next.length === current.length) {
    return worktreeSetupByRepoPath;
  }

  const { [repoPath]: _removed, ...rest } = worktreeSetupByRepoPath;
  return next.length > 0 ? { ...rest, [repoPath]: next } : rest;
}

export function isWorktreeSettingUp(
  worktreeSetupByRepoPath: Record<string, string[]>,
  repoPath: string,
  worktreeName: string
): boolean {
  return worktreeSetupByRepoPath[repoPath]?.includes(worktreeName) ?? false;
}
