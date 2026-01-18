import { useMemo } from "react";
import {
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Square,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
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

function getStatusColor(status: ChangedFile["status"]) {
  switch (status) {
    case "added":
    case "untracked":
      return "#22C55E";
    case "deleted":
      return "#EF4444";
    case "modified":
    case "renamed":
    case "copied":
      return "#F59E0B";
    default:
      return "#6B7280";
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
  const theme = useTheme();

  const parsedDiff = useMemo(() => {
    if (!fileDiff?.patch) return [];
    return parsePatch(fileDiff.patch);
  }, [fileDiff?.patch]);

  if (changedFiles.length === 0 && !isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.secondary }}
      >
        No changes detected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="overflow-y-auto border-b"
        style={{
          borderColor: theme.border.default,
          maxHeight: selectedFile ? "180px" : "100%",
        }}
      >
        {changedFiles.map((file) => {
          const Icon = getFileIcon(file.status);
          const statusColor = getStatusColor(file.status);
          const isSelected = selectedFile === file.path;
          const dir = dirname(file.path);

          return (
            <div
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className="px-3 py-1.5 cursor-pointer flex items-center gap-2 transition-colors"
              style={{
                background: isSelected ? theme.bg.active : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = theme.bg.hover;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <Icon
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: statusColor }}
              />
              <div className="flex-1 min-w-0 flex items-center gap-1">
                <span
                  className="truncate text-sm"
                  style={{ color: theme.text.primary }}
                >
                  {basename(file.path)}
                </span>
                {dir && (
                  <span
                    className="truncate text-xs"
                    style={{ color: theme.text.tertiary }}
                  >
                    {dir}
                  </span>
                )}
              </div>
              <div
                className="flex items-center gap-1.5 text-xs font-mono flex-shrink-0"
                style={{ color: theme.text.tertiary }}
              >
                {file.additions > 0 && (
                  <span style={{ color: "#22C55E" }}>+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span style={{ color: "#EF4444" }}>-{file.deletions}</span>
                )}
                <Square
                  className="w-3 h-3"
                  style={{ color: statusColor }}
                  fill={statusColor}
                />
              </div>
            </div>
          );
        })}
      </div>

      {selectedFile && (
        <div
          className="flex-1 overflow-auto"
          style={{ background: theme.bg.primary }}
        >
          {!fileDiff && !isLoading && (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: theme.text.secondary }}
            >
              Loading diff...
            </div>
          )}
          {parsedDiff.length > 0 && (
            <div className="font-mono text-xs">
              {parsedDiff.map((line, index) => {
                if (line.type === "hunk-header") {
                  return (
                    <div
                      key={index}
                      className="flex px-2 py-1"
                      style={{
                        background: theme.bg.tertiary,
                        color: theme.text.tertiary,
                        borderTop:
                          index > 0
                            ? `1px solid ${theme.border.default}`
                            : undefined,
                        borderBottom: `1px solid ${theme.border.default}`,
                      }}
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
                    className="flex"
                    style={{
                      background: isAdd
                        ? "rgba(34, 197, 94, 0.15)"
                        : isDel
                        ? "rgba(239, 68, 68, 0.15)"
                        : "transparent",
                      color: isAdd
                        ? "#22C55E"
                        : isDel
                        ? "#EF4444"
                        : theme.text.secondary,
                      padding: "1px 8px",
                      whiteSpace: "pre",
                    }}
                  >
                    <span
                      style={{
                        width: "40px",
                        textAlign: "right",
                        paddingRight: "12px",
                        color: theme.text.tertiary,
                        userSelect: "none",
                      }}
                    >
                      {isDel ? line.oldLineNum : line.newLineNum}
                    </span>
                    <span style={{ width: "16px", userSelect: "none" }}>
                      {isAdd ? "+" : isDel ? "-" : " "}
                    </span>
                    <span style={{ flex: 1 }}>{line.content}</span>
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
