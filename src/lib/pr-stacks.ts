import type { PRStatus } from '../types/github';

/**
 * A single node in the stack tree.
 * `depth` is the distance from the root (0 = root).
 */
export interface StackNode {
  pr: PRStatus;
  children: StackNode[];
  depth: number;
}

/**
 * A complete stack group — one root PR and all its descendants.
 */
export interface StackGroup {
  root: StackNode;
  allPrs: PRStatus[];
}

export interface StackDetectionResult {
  /** Stack groups detected via base_branch → head_branch chains */
  stacks: StackGroup[];
  /** PRs that have no relationship to any other tracked PR */
  standalone: PRStatus[];
}

function flattenTree(node: StackNode): PRStatus[] {
  return [node.pr, ...node.children.flatMap(flattenTree)];
}

/**
 * Detect stacked PR groups from a branch-indexed PR status map.
 *
 * A "stack" is a tree of PRs connected via base_branch → head_branch.
 *   - Root: a PR whose base_branch is NOT another tracked PR's head_branch.
 *   - Child: a PR whose base_branch IS another tracked PR's head_branch.
 *   - Standalone: a PR with no relationship to any tracked PR.
 *
 * Non-root PRs are never standalone — they're always part of a stack
 * reachable from a root.
 */
export function detectStacks(
  prs: Record<string, PRStatus>,
): StackDetectionResult {
  const headMap = new Map(Object.entries(prs));
  const childrenMap = new Map<string, PRStatus[]>();

  // Build parent (base_branch) → children index
  for (const pr of headMap.values()) {
    const base = pr.base_branch;
    if (!childrenMap.has(base)) {
      childrenMap.set(base, []);
    }
    childrenMap.get(base)!.push(pr);
  }

  // Roots: PRs whose base_branch isn't a tracked head
  const roots: PRStatus[] = [];
  for (const pr of headMap.values()) {
    if (!headMap.has(pr.base_branch)) {
      roots.push(pr);
    }
  }

  const visited = new Set<string>();

  function buildNode(pr: PRStatus, depth: number): StackNode {
    visited.add(pr.head_branch);
    const rawChildren = childrenMap.get(pr.head_branch) ?? [];
    const sorted = [...rawChildren].sort((a, b) => a.number - b.number);
    const children = sorted.map((c) => buildNode(c, depth + 1));
    return { pr, children, depth };
  }

  const stacks: StackGroup[] = [];
  const standalone: PRStatus[] = [];

  for (const root of roots) {
    const node = buildNode(root, 0);
    if (node.children.length > 0) {
      // Has dependents → it's a stack
      const allPrs = flattenTree(node);
      stacks.push({ root: node, allPrs });
    } else {
      standalone.push(root);
    }
  }

  // Catch any PRs not reached from roots (orphans, e.g. cycles or
  // missing intermediate PRs). These are shown as standalone.
  for (const pr of headMap.values()) {
    if (!visited.has(pr.head_branch)) {
      standalone.push(pr);
    }
  }

  return { stacks, standalone };
}

/**
 * Build a human-readable label for a stack group.
 * Prioritises the root PR title, falling back to the branch name.
 */
export function getStackLabel(stack: StackGroup): string {
  const rootTitle = stack.root.pr.title;
  if (rootTitle && rootTitle.length > 0) {
    return rootTitle.length > 60
      ? rootTitle.slice(0, 57) + '...'
      : rootTitle;
  }
  return stack.root.pr.head_branch;
}
