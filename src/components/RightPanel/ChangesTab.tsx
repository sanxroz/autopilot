import { useMemo } from "react";
import {
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Square,
  Loader
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { ChangedFile, FileDiffData } from "../../types";

interface ChangesTabProps {
  changedFiles: ChangedFile[];
  selectedFile: string | null;
  fileDiff: FileDiffData | null;
  isLoading: boolean;
  onSelectFile: (path: string) => void;
}

function getFileIcon(status: ChangedFile["status"]) {
  switch (status) {
    case "added":
    case "untracked":
      return FilePlus;
    case "deleted":
      return FileMinus;
    case "modified":
    case "renamed":
    case "copied":
      return FileEdit;
    default:
      return FileCode;
  }
}

function getStatusColorClass(status: ChangedFile["status"]): string {
  switch (status) {
    case "added":
    case "untracked":
      return "text-semantic-success";
    case "deleted":
      return "text-semantic-error";
    case "modified":
    case "renamed":
    case "copied":
      return "text-semantic-warning";
    default:
      return "text-tertiary";
  }
}

function getStatusFillClass(status: ChangedFile["status"]): string {
  switch (status) {
    case "added":
    case "untracked":
      return "fill-semantic-success";
    case "deleted":
      return "fill-semantic-error";
    case "modified":
    case "renamed":
    case "copied":
      return "fill-semantic-warning";
    default:
      return "fill-tertiary";
  }
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

interface DiffLine {
  type: "add" | "del" | "context" | "hunk-header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parsePatch(patch: string): DiffLine[] {
  if (!patch || patch.trim() === "") return [];

  const lines = patch.split("\n");
  const result: DiffLine[] = [];

  let oldLineNum = 1;
  let newLineNum = 1;

  for (const line of lines) {
    if (line === "" && lines.indexOf(line) === lines.length - 1) continue;

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      result.push({ type: "hunk-header", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        type: "add",
        content: line.substring(1),
        newLineNum: newLineNum++,
      });
      continue;
    }

    if (line.startsWith("-")) {
      result.push({
        type: "del",
        content: line.substring(1),
        oldLineNum: oldLineNum++,
      });
      continue;
    }

    if (line.startsWith(" ")) {
      result.push({
        type: "context",
        content: line.substring(1),
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
      continue;
    }

    if (line.length > 0) {
      result.push({
        type: "context",
        content: line,
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    }
  }

  return result;
}

export function ChangesTab({
  changedFiles,
  selectedFile,
  fileDiff,
  isLoading,
  onSelectFile,
}: ChangesTabProps) {
  const parsedDiff = useMemo(() => {
    if (!fileDiff?.patch) return [];
    return parsePatch(fileDiff.patch);
  }, [fileDiff?.patch]);

  if (changedFiles.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-secondary">
        No changes detected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="overflow-y-auto border-b border-border"
        style={{
          maxHeight: selectedFile ? "180px" : "100%",
        }}
      >
        {changedFiles.map((file) => {
          const Icon = getFileIcon(file.status);
          const statusColorClass = getStatusColorClass(file.status);
          const statusFillClass = getStatusFillClass(file.status);
          const isSelected = selectedFile === file.path;
          const dir = dirname(file.path);

          return (
            <div
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectFile(file.path);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${basename(file.path)}, ${file.status}, ${file.additions} additions, ${file.deletions} deletions`}
              aria-selected={isSelected}
              className={cn(
                "px-3 py-1.5 cursor-pointer flex items-center gap-2 transition-colors",
                isSelected ? "bg-active" : "hover:bg-hover"
              )}
            >
              <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", statusColorClass)} />
              <div className="flex-1 min-w-0 flex items-center gap-1">
                <span className="truncate text-sm text-primary">
                  {basename(file.path)}
                </span>
                {dir && (
                  <span className="truncate text-xs text-tertiary">
                    {dir}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono flex-shrink-0 text-tertiary">
                {file.additions > 0 && (
                  <span className="text-semantic-success">+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span className="text-semantic-error">-{file.deletions}</span>
                )}
                <Square className={cn("w-3.5 h-3.5", statusColorClass, statusFillClass)} />
              </div>
            </div>
          );
        })}
      </div>

      {selectedFile && (
        <div className="flex-1 overflow-auto bg-primary">
          {!fileDiff && !isLoading && (
            <div className="flex items-center justify-center h-full text-sm text-secondary">
              <Loader className="w-3.5 h-3.5 animate-spin mr-2" />
              <span className="text-sm font-medium">Loading diff...</span>
            </div>
          )}
          {parsedDiff.length > 0 && (
            <div className="font-mono text-xs">
              {parsedDiff.map((line, index) => {
                if (line.type === "hunk-header") {
                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex px-2 py-1 bg-tertiary text-tertiary border-b border-border",
                        index > 0 && "border-t"
                      )}
                    >
                      <span className="opacity-70">{line.content}</span>
                    </div>
                  );
                }

                const isAdd = line.type === "add";
                const isDel = line.type === "del";

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex px-2 py-px whitespace-pre",
                      isAdd && "bg-semantic-success-muted text-semantic-success",
                      isDel && "bg-semantic-error-muted text-semantic-error",
                      !isAdd && !isDel && "text-secondary"
                    )}
                  >
                    <span className="w-10 text-right pr-3 text-tertiary select-none">
                      {isDel ? line.oldLineNum : line.newLineNum}
                    </span>
                    <span className="w-4 select-none">
                      {isAdd ? "+" : isDel ? "-" : " "}
                    </span>
                    <span className="flex-1">{line.content}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
