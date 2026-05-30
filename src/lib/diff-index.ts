export type DiffIndex = Map<string, string>;

const DIFF_HEADER_RE = /^diff --git (?:"a\/(.+)"|a\/(\S+)) (?:"b\/(.+)"|b\/(\S+))/;

export function buildDiffIndex(fullDiff: string): DiffIndex {
  const entries: Array<{ paths: string[]; lines: string[] }> = [];
  let current: { paths: string[]; lines: string[] } | null = null;

  for (const line of fullDiff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) entries.push(current);
      current = { paths: parseDiffHeaderPaths(line), lines: [line] };
      continue;
    }

    if (current) {
      current.lines.push(line);
      addPathFromMetadata(current.paths, line);
    }
  }

  if (current) entries.push(current);

  const index: DiffIndex = new Map();
  for (const entry of entries) {
    const patch = entry.lines.join('\n');
    for (const path of entry.paths) {
      index.set(path, patch);
    }
  }
  return index;
}

function parseDiffHeaderPaths(line: string): string[] {
  const match = line.match(DIFF_HEADER_RE);
  if (!match) return [];
  return uniquePaths([match[1], match[2], match[3], match[4]].filter(Boolean) as string[]);
}

function addPathFromMetadata(paths: string[], line: string) {
  if (!line.startsWith('--- ') && !line.startsWith('+++ ')) return;
  const rawPath = line.slice(4).trim();
  if (rawPath === '/dev/null') return;
  const path = stripGitPrefix(unquotePath(rawPath));
  if (path && !paths.includes(path)) {
    paths.push(path);
  }
}

function stripGitPrefix(path: string): string {
  if (path.startsWith('a/') || path.startsWith('b/')) return path.slice(2);
  return path;
}

function unquotePath(path: string): string {
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1).replace(/\\"/g, '"');
  }
  return path;
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map(stripGitPrefix).filter(Boolean)));
}

