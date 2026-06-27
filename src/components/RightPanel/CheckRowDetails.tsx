import { useState } from "react";
import { Check, Copy, ExternalLink, Loader } from "lucide-react";
import type { PRCheck, PRCheckDetail, PRCheckStep } from "../../types/github";
import { cn } from "../../utils/cn";
import { formatDuration, formatTimestamp } from "./checks-tab-domain";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-primary px-2 py-1 text-[11px] text-secondary transition-colors hover:bg-hover hover:text-primary"
      type="button"
    >
      {copied ? <Check className="h-3 w-3 text-semantic-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function getLogLineClass(line: string): string {
  const normalized = line.trim().toLowerCase();

  if (!normalized) {
    return "text-secondary/80";
  }
  if (
    normalized.startsWith("error") ||
    normalized.includes("assertion failed") ||
    normalized.includes("failed") ||
    normalized.includes("panic") ||
    normalized.includes("exception") ||
    normalized.includes("traceback")
  ) {
    return "text-semantic-error";
  }
  if (
    normalized.startsWith("expected:") ||
    normalized.startsWith("received:") ||
    normalized.startsWith("actual:") ||
    normalized.startsWith("stderr")
  ) {
    return "text-semantic-warning";
  }
  if (
    normalized.startsWith("note:") ||
    normalized.startsWith("help:") ||
    normalized.startsWith("hint:")
  ) {
    return "text-semantic-info";
  }
  if (
    normalized.startsWith("at ") ||
    normalized.includes(".rs:") ||
    normalized.includes(".ts:") ||
    normalized.includes(".tsx:") ||
    normalized.includes(".js:")
  ) {
    return "text-tertiary";
  }

  return "text-primary";
}

function isFailedStep(status: string, conclusion: string | null): boolean {
  const normalizedStatus = status.trim().toLowerCase();
  const normalizedConclusion = conclusion?.trim().toLowerCase() ?? "";

  return (
    normalizedConclusion === "failure" ||
    normalizedConclusion === "cancelled" ||
    normalizedConclusion === "timed_out" ||
    normalizedConclusion === "action_required" ||
    normalizedStatus === "failure"
  );
}

function StepRow({ step }: { step: PRCheckStep }) {
  const isFailed = isFailedStep(step.status, step.conclusion);

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2",
        isFailed ? "bg-semantic-error/6" : "bg-secondary/35",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] text-primary">{step.name}</div>
          <div
            className={cn(
              "mt-1 text-[11px] capitalize",
              isFailed ? "text-semantic-error" : "text-tertiary",
            )}
          >
            {step.conclusion ?? step.status}
          </div>
        </div>
        <div className="flex-shrink-0 font-mono tabular-nums text-[11px] text-tertiary">
          {formatDuration(step.started_at, step.completed_at) || "--"}
        </div>
      </div>
    </div>
  );
}

interface CheckRowDetailsProps {
  check: PRCheck;
  detail: PRCheckDetail | null;
  detailError: string | null;
  isLoadingDetail: boolean;
}

export function CheckRowDetails({
  check,
  detail,
  detailError,
  isLoadingDetail,
}: CheckRowDetailsProps) {
  const failedSteps = detail?.steps.filter((step) =>
    isFailedStep(step.status, step.conclusion),
  ) ?? [];
  const visibleSteps = failedSteps.length > 0 ? failedSteps : (detail?.steps ?? []);

  return (
    <div className="ml-6 border-l border-dashed border-border px-4 pb-3 pl-5 select-text">
      <div className="space-y-3 pt-1 text-xs text-secondary">
        {check.description && (
          <p className="text-[12px] leading-5 text-secondary">{check.description}</p>
        )}

        <div className="grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
          <div>
            <span className="text-tertiary">Status</span>
            <div className="mt-0.5 text-primary">{check.state}</div>
          </div>
          <div>
            <span className="text-tertiary">Started</span>
            <div className="mt-0.5 text-primary">
              {check.started_at ? formatTimestamp(check.started_at) : "Not reported"}
            </div>
          </div>
          {check.workflow && (
            <div>
              <span className="text-tertiary">Workflow</span>
              <div className="mt-0.5 text-primary">{check.workflow}</div>
            </div>
          )}
          <div>
            <span className="text-tertiary">Completed</span>
            <div className="mt-0.5 text-primary">
              {check.completed_at ? formatTimestamp(check.completed_at) : "Still running"}
            </div>
          </div>
          {check.event && (
            <div>
              <span className="text-tertiary">Event</span>
              <div className="mt-0.5 text-primary">{check.event.replace(/_/g, " ")}</div>
            </div>
          )}
        </div>

        {check.url && (
          <a
            href={check.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-secondary transition-colors hover:text-primary"
          >
            Open on GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {isLoadingDetail && (
          <div className="flex items-center gap-2 text-[12px] text-secondary">
            <Loader className="h-3.5 w-3.5 animate-spin" />
            Loading job details...
          </div>
        )}

        {detailError && (
          <div className="rounded-md border border-semantic-error/15 bg-semantic-error/5 px-3 py-2 text-[12px] text-semantic-error">
            {detailError}
          </div>
        )}

        {visibleSteps.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-tertiary">
              {failedSteps.length > 0 ? "Failed step" : "Steps"}
            </div>
            <div className="space-y-2">
              {visibleSteps.map((step) => (
                <StepRow key={`${check.name}:step:${step.number}`} step={step} />
              ))}
            </div>
          </div>
        )}

        {detail?.failed_log_excerpt && (
          <div className="overflow-hidden rounded-md border border-semantic-error/15 bg-semantic-error/5">
            <div className="flex items-center justify-between gap-3 border-b border-semantic-error/10 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.08em] text-semantic-error">
                Failure output
              </div>
              <CopyButton text={detail.failed_log_excerpt} />
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-3 font-mono text-[11px] leading-5 select-text">
              {detail.failed_log_excerpt.split("\n").map((line, index) => (
                <div key={`${check.name}:log:${index}`} className={getLogLineClass(line)}>
                  {line || " "}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
