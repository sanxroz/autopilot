import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Loader, CheckCircle, XCircle, Terminal } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import type { CubicReviewResult } from "../../types/github";

interface ReviewTabProps {
  repoPath: string | null;
}

export function ReviewTab({ repoPath }: ReviewTabProps) {
  const theme = useTheme();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<CubicReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runReview = useCallback(async () => {
    if (!repoPath) return;

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const reviewResult = await invoke<CubicReviewResult>("run_cubic_review", {
        repoPath,
      });
      setResult(reviewResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsRunning(false);
    }
  }, [repoPath]);

  if (!repoPath) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.secondary }}
      >
        Select a workspace to run AI review
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-3 py-3 flex items-center justify-between"
        style={{ borderColor: theme.border.default }}
      >
        <div className="flex items-center gap-2">
          <Terminal
            className="w-3.5 h-3.5"
            style={{ color: theme.text.tertiary }}
          />
          <span className="text-sm" style={{ color: theme.text.primary }}>
            Cubic AI Review
          </span>
        </div>
        <button
          onClick={runReview}
          disabled={isRunning}
          className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
          style={{
            background: isRunning ? theme.bg.tertiary : "#3B82F6",
            color: isRunning ? theme.text.secondary : "white",
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? (
            <>
              <Loader className="w-3.5 h-3.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Run Review
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {!result && !error && !isRunning && (
          <div
            className="flex flex-col items-center justify-center h-full text-center gap-3"
            style={{ color: theme.text.secondary }}
          >
            <Terminal
              className="w-8 h-8"
              style={{ color: theme.text.tertiary }}
            />
            <div>
              <p className="text-sm mb-1">Run AI-powered code review</p>
              <p className="text-xs" style={{ color: theme.text.tertiary }}>
                Uses cubic CLI to analyze your changes
              </p>
            </div>
          </div>
        )}

        {isRunning && (
          <div
            className="flex flex-col items-center justify-center h-full text-center gap-3"
            style={{ color: theme.text.secondary }}
          >
            <Loader
              className="w-8 h-8 animate-spin"
              style={{ color: "#3B82F6" }}
            />
            <p className="text-sm">Analyzing your code...</p>
          </div>
        )}

        {error && (
          <div
            className="rounded p-3"
            style={{
              background: theme.semantic.errorMuted,
              border: `1px solid ${theme.semantic.error}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <XCircle
                className="w-3.5 h-3.5"
                style={{ color: theme.semantic.error }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: theme.semantic.error }}
              >
                Review Failed
              </span>
            </div>
            <pre
              className="text-xs whitespace-pre-wrap"
              style={{ color: theme.text.secondary }}
            >
              {error}
            </pre>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div
              className="flex items-center gap-2 px-2 py-1 rounded"
              style={{
                background: result.success
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
              }}
            >
              {result.success ? (
                <CheckCircle
                  className="w-3.5 h-3.5"
                  style={{ color: "#22C55E" }}
                />
              ) : (
                <XCircle
                  className="w-3.5 h-3.5"
                  style={{ color: "#EF4444" }}
                />
              )}
              <span
                className="text-sm font-medium"
                style={{ color: result.success ? "#22C55E" : "#EF4444" }}
              >
                {result.success ? "Review Complete" : "Review Failed"}
              </span>
            </div>

            {result.output && (
              <div
                className="rounded p-3 overflow-auto"
                style={{
                  background: theme.bg.tertiary,
                  maxHeight: "400px",
                }}
              >
                <pre
                  className="text-xs whitespace-pre-wrap font-mono"
                  style={{ color: theme.text.primary }}
                >
                  {result.output}
                </pre>
              </div>
            )}

            {result.error && (
              <div
                className="rounded p-3"
                style={{
                  background: theme.semantic.errorMuted,
                  border: `1px solid ${theme.semantic.error}`,
                }}
              >
                <pre
                  className="text-xs whitespace-pre-wrap"
                  style={{ color: theme.semantic.error }}
                >
                  {result.error}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
