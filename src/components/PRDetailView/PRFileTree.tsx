import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronRight,
  FilePlus,
  FileMinus,
  FileEdit,
  FileCode,
  FolderOpen,
  Folder,
  Search,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import type { PRFile } from '../../types/github';

/* ── Utility helpers ───────────────────────────────────────────────── */

function getFileStatusIcon(file: PRFile) {
  // Heuristic: 0 deletions with additions → added, 0 additions with deletions → deleted, else modified
  if (file.deletions === 0 && file.additions > 0) return FilePlus;
  if (file.additions === 0 && file.deletions > 0) return FileMinus;
  if (file.additions > 0 || file.deletions > 0) return FileEdit;
  return FileCode;
}

function getStatusColor(file: PRFile): string {
  if (file.deletions === 0 && file.additions > 0) return 'text-semantic-success';
  if (file.additions === 0 && file.deletions > 0) return 'text-semantic-error';
  if (file.additions > 0 || file.deletions > 0) return 'text-semantic-warning';
  return 'text-tertiary';
}


/* ── Tree node types ───────────────────────────────────────────────── */

interface TreeFolder {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

interface TreeFile {
  type: 'file';
  name: string;
  file: PRFile;
}

type TreeNode = TreeFolder | TreeFile;

function buildTree(files: PRFile[]): TreeNode[] {
  const root: TreeFolder = { type: 'folder', name: '', path: '', children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const dirPath = parts.slice(0, i + 1).join('/');
      let existing = current.children.find(
        (c): c is TreeFolder => c.type === 'folder' && c.name === dirName
      );
      if (!existing) {
        existing = { type: 'folder', name: dirName, path: dirPath, children: [] };
        current.children.push(existing);
      }
      current = existing;
    }

    current.children.push({
      type: 'file',
      name: parts[parts.length - 1],
      file,
    });
  }

  // Flatten single-child folders for compact display
  function flatten(nodes: TreeNode[]): TreeNode[] {
    return nodes.map((node) => {
      if (node.type === 'folder') {
        node.children = flatten(node.children);
        // Collapse single-child folder chains
        if (node.children.length === 1 && node.children[0].type === 'folder') {
          const child = node.children[0];
          return {
            ...child,
            name: `${node.name}/${child.name}`,
          };
        }
      }
      return node;
    });
  }

  return flatten(root.children);
}

/* ── FolderNode component ──────────────────────────────────────────── */

function FolderNode({
  node,
  selectedFile,
  onSelectFile,
  depth,
  expandedFolders,
  onToggleFolder,
}: {
  node: TreeFolder;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  depth: number;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <div>
      <button
        onClick={() => onToggleFolder(node.path)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-hover"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted',
            isExpanded && 'rotate-90'
          )}
        />
        <FolderIcon className="size-3.5 shrink-0 text-tertiary" />
        <span className="truncate text-secondary">{node.name}</span>
      </button>
      {isExpanded && (
        <div>
          {node.children.map((child) =>
            child.type === 'folder' ? (
              <FolderNode
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                depth={depth + 1}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
              />
            ) : (
              <FileNode
                key={child.file.path}
                node={child}
                isSelected={selectedFile === child.file.path}
                onSelect={() => onSelectFile(child.file.path)}
                depth={depth + 1}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ── FileNode component ────────────────────────────────────────────── */

function FileNode({
  node,
  isSelected,
  onSelect,
  depth,
}: {
  node: TreeFile;
  isSelected: boolean;
  onSelect: () => void;
  depth: number;
}) {
  const Icon = getFileStatusIcon(node.file);
  const colorClass = getStatusColor(node.file);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs',
        isSelected
          ? 'bg-accent-primary/10 text-primary'
          : 'text-secondary hover:bg-hover'
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <Icon className={cn('size-3.5 shrink-0', colorClass)} />
      <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
      <span className="shrink-0 font-mono text-2xs tabular-nums">
        {node.file.additions > 0 && (
          <span className="text-semantic-success">+{node.file.additions}</span>
        )}
        {node.file.additions > 0 && node.file.deletions > 0 && ' '}
        {node.file.deletions > 0 && (
          <span className="text-semantic-error">-{node.file.deletions}</span>
        )}
      </span>
    </button>
  );
}

/* ── PRFileTree (main export) ──────────────────────────────────────── */

interface PRFileTreeProps {
  files: PRFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  isLoading: boolean;
}

export function PRFileTree({
  files,
  selectedFile,
  onSelectFile,
  isLoading,
}: PRFileTreeProps) {
  const [filter, setFilter] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const hasInitializedExpansionRef = useRef(false);
  const previousFilterRef = useRef('');

  const filteredFiles = useMemo(() => {
    if (!filter.trim()) return files;
    const q = filter.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, filter]);

  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

  // Auto-expand all folders on initial load or filter change, but preserve user toggles during refreshes
  useEffect(() => {
    const allFolderPaths = new Set<string>();
    function collectFolders(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === 'folder') {
          allFolderPaths.add(node.path);
          collectFolders(node.children);
        }
      }
    }
    collectFolders(tree);

    const filterChanged = previousFilterRef.current !== filter;
    previousFilterRef.current = filter;

    setExpandedFolders((prev) => {
      if (!hasInitializedExpansionRef.current || filterChanged) {
        return allFolderPaths;
      }

      const next = new Set(Array.from(prev).filter((path) => allFolderPaths.has(path)));
      if (prev.size > 0 && next.size === 0 && allFolderPaths.size > 0) {
        return allFolderPaths;
      }

      return next;
    });

    hasInitializedExpansionRef.current = true;
  }, [tree, filter]);

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-primary">Files</span>
          <div className="flex items-center gap-2 text-2xs tabular-nums">
            <span className="rounded bg-hover px-1.5 py-0.5 text-secondary">
              {files.length}
            </span>
            {totalAdditions > 0 && (
              <span className="font-mono text-semantic-success">
                +{totalAdditions}
              </span>
            )}
            {totalDeletions > 0 && (
              <span className="font-mono text-semantic-error">
                -{totalDeletions}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter input */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-secondary px-2 py-1">
          <Search className="size-3 shrink-0 text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Filter files…"
            className="w-full bg-transparent text-xs text-primary placeholder:text-muted focus:outline-none"
          />
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {isLoading ? (
          <div className="space-y-1.5 px-2 py-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-5 rounded bg-hover"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted">
            {filter ? 'No files match filter' : 'No changed files'}
          </div>
        ) : (
          tree.map((node) =>
            node.type === 'folder' ? (
              <FolderNode
                key={node.path}
                node={node}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                depth={0}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
              />
            ) : (
              <FileNode
                key={node.file.path}
                node={node}
                isSelected={selectedFile === node.file.path}
                onSelect={() => onSelectFile(node.file.path)}
                depth={0}
              />
            )
          )
        )}
      </div>
    </div>
  );
}
