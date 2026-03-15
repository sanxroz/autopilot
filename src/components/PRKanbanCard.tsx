import { cn } from '../utils/cn';
import type { PRStatus } from '../types/github';

export type PRAction = 'approve' | 'close' | 'merge';

function toAgeLabel(iso: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

interface PRKanbanCardProps {
  pr: PRStatus;
  repoPath: string;
  repoName: string;
  isFocused: boolean;
  isSelected: boolean;
  needsMyReview?: boolean;
  onToggleSelect: () => void;
  onAction: (action: PRAction) => void;
  onOpenDetail: () => void;
}

export function PRKanbanCard({
  pr,
  repoName,
  isFocused,
  isSelected,
  needsMyReview,
  onToggleSelect: _onToggleSelect,
  onAction: _onAction,
  onOpenDetail,
}: PRKanbanCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-primary transition-all text-left w-full cursor-pointer',
        isFocused
          ? 'border-accent-primary ring-1 ring-accent-primary/40'
          : isSelected
            ? 'border-border bg-hover'
            : 'border-border-subtle hover:border-border',
      )}
      onClick={onOpenDetail}
    >
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-primary leading-snug line-clamp-2">
          {pr.title}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="truncate">
            {pr.author} · {repoName}
          </span>
          {needsMyReview && (
            <span className="shrink-0 rounded-full bg-semantic-warning-muted px-1.5 py-0.5 text-2xs font-medium text-semantic-warning">
              Review requested
            </span>
          )}
          <span className="ml-auto shrink-0 pl-1 tabular-nums">
            {toAgeLabel(pr.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
