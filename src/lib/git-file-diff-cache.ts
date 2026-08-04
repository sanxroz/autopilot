import { invoke } from "@tauri-apps/api/core";
import type { FileDiffData } from "../types";

const MAX_CACHE_ENTRIES = 6;
const MAX_CACHE_CHARS = 4_000_000;

const cache = new Map<string, { data: FileDiffData; size: number }>();
const inFlight = new Map<string, Promise<FileDiffData>>();
const generations = new Map<string, number>();
let cacheChars = 0;

export function getGitFileDiffKey(
  worktreePath: string,
  filePath: string,
  isStaged: boolean,
  includeContent: boolean,
): string {
  return `${worktreePath}\0${isStaged}\0${includeContent}\0${filePath}`;
}

export function getCachedGitFileDiff(key: string): FileDiffData | null {
  const cached = cache.get(key);
  if (!cached) return null;
  cache.delete(key);
  cache.set(key, cached);
  return cached.data;
}

function cacheDiff(key: string, data: FileDiffData): void {
  const size =
    data.patch.length +
    (data.old_content?.length ?? 0) +
    (data.new_content?.length ?? 0) +
    (data.worktree_content?.length ?? 0);

  if (size > MAX_CACHE_CHARS) return;

  const previous = cache.get(key);
  if (previous) cacheChars -= previous.size;
  cache.delete(key);
  cache.set(key, { data, size });
  cacheChars += size;

  while (cache.size > MAX_CACHE_ENTRIES || cacheChars > MAX_CACHE_CHARS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey == null) break;
    const oldest = cache.get(oldestKey);
    if (oldest) cacheChars -= oldest.size;
    cache.delete(oldestKey);
  }
}

export function loadGitFileDiff(
  worktreePath: string,
  filePath: string,
  isStaged: boolean,
  includeContent: boolean,
): Promise<FileDiffData> {
  const key = getGitFileDiffKey(
    worktreePath,
    filePath,
    isStaged,
    includeContent,
  );
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return Promise.resolve(cached.data);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const generation = generations.get(worktreePath) ?? 0;
  let request: Promise<FileDiffData>;
  request = invoke<FileDiffData>("get_uncommitted_diff", {
    worktreePath,
    filePath,
    isStaged,
    includeContent,
  })
    .then((data) => {
      if ((generations.get(worktreePath) ?? 0) === generation) {
        cacheDiff(key, data);
      }
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function invalidateGitFileDiffCache(worktreePath: string): void {
  const prefix = `${worktreePath}\0`;
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue;
    cacheChars -= entry.size;
    cache.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
  generations.set(worktreePath, (generations.get(worktreePath) ?? 0) + 1);
}
