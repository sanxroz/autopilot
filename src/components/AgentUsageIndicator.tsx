import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Content as TooltipContent,
  Root as TooltipRoot,
  Trigger as TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "../utils/cn";
import { formatQuotaWindow, formatResetTime } from "../lib/agent-usage";

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
}

interface CodexUsage {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot>;
}

interface DisplayWindow {
  id: string;
  window: RateLimitWindow;
}

interface DisplayGroup {
  id: string;
  name: string;
  windows: DisplayWindow[];
}

type ProviderId = "claude" | "codex";

interface ProviderState {
  usage: CodexUsage | null;
  error: string | null;
}

const PROVIDERS = [
  { id: "codex", name: "Codex", command: "get_codex_usage" },
  { id: "claude", name: "Claude", command: "get_claude_usage" },
] as const;

const REFRESH_INTERVAL_MS = 60_000;
const pendingUsageRequests = new Map<string, Promise<CodexUsage>>();

function requestUsage(command: string): Promise<CodexUsage> {
  let request = pendingUsageRequests.get(command);
  if (!request) {
    request = invoke<CodexUsage>(command).finally(() => {
      pendingUsageRequests.delete(command);
    });
    pendingUsageRequests.set(command, request);
  }
  return request;
}

function getDisplayGroups(usage: CodexUsage): DisplayGroup[] {
  const snapshots = Object.keys(usage.rateLimitsByLimitId).length
    ? Object.entries(usage.rateLimitsByLimitId)
    : [[usage.rateLimits.limitId ?? "codex", usage.rateLimits] as const];

  return snapshots.flatMap(([id, snapshot]) => {
    const name = snapshot.limitName ?? (id === "codex" ? "Codex" : id);
    const windows = [snapshot.primary, snapshot.secondary].flatMap((window) =>
      window ? [{ id: `${id}-${window.windowDurationMins}`, window }] : [],
    );
    return windows.length > 0 ? [{ id, name, windows }] : [];
  });
}

function ChunkyUsageRing({ usedPercent, error }: { usedPercent?: number; error: boolean }) {
  const used = Math.min(100, Math.max(0, usedPercent ?? 100));
  const tone = error
    ? "text-semantic-error"
    : usedPercent === undefined ? "text-tertiary" : "text-semantic-info";

  return (
    <svg className={cn("h-5 w-5 -rotate-90", tone)} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3" />
      <circle
        className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
        cx="10"
        cy="10"
        r="7"
        fill="none"
        pathLength="100"
        stroke="currentColor"
        strokeDasharray="100"
        strokeDashoffset={100 - used}
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function ProviderMark({ provider }: { provider: ProviderId }) {
  if (provider === "claude") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="m4.714 15.956 4.718-2.648.079-.23-.079-.128H9.2l-8.657-.461-.534-.704.055-.352.48-.322 8.938.868.055-.158-7.536-5.596-.158-1.008.656-.722.88.061 5.927 4.253.146-.103.018-.073-3.114-5.968-.17-.619c-.061-.255-.103-.467-.103-.729L6.287.134 6.7 0l.996.134.419.364 3.864 8.657.091.255h.158v-.146l.443-6.215.079-.759.376-.91.747-.492.583.279.479.686-1.275 7.013h.213l4.395-5.094.85-.905.546-.431h1.032l.759 1.129-.34 1.166-4.844 6.54.073.109.188-.018 7.067-1.202.832.389.091.394-.328.808-7.576 1.76-.043.031.049.06 6.838.407.789.522.474.638-.079.486-1.214.619-6.776-1.627h-.182v.11l6.732 6.286.127.577-.321.455-.34-.049-5.104-4.025h-.127v.17l2.787 4.171.121 1.081-.17.352-.607.213-.668-.122-4.625-6.696-.14.079-.99 7.625-.729.279-.607-.461-.322-.747 1.36-6.461-.012-.043-.14.019-5.337 6.757-.413.164-.716-.371.067-.662 5.155-6.593-.006-.158h-.055l-6.338 4.117-1.13.146-.485-.456.061-.747.23-.243 1.907-1.311Z" />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 512 512" aria-hidden="true">
      <path fill="currentColor" d="M196.4 185.8v-48.6c0-4.1 1.5-7.2 5.1-9.2l97.8-56.3c13.3-7.7 29.2-11.3 45.6-11.3 61.4 0 100.4 47.6 100.4 98.3 0 3.6 0 7.7-.5 11.8L343.3 111.1c-6.1-3.6-12.3-3.6-18.4 0L196.4 185.8Zm228.3 189.4V259c0-7.2-3.1-12.3-9.2-15.9L287 168.4l42-24.1c3.6-2 6.7-2 10.2 0l97.8 56.4c28.2 16.4 47.1 51.2 47.1 85 0 38.9-23 74.8-59.4 89.5ZM166.2 272.8l-42-24.6c-3.6-2-5.1-5.1-5.1-9.2V126.4c0-54.8 42-96.3 98.8-96.3 21.5 0 41.5 7.2 58.4 20L175.4 108.5c-6.1 3.6-9.2 8.7-9.2 15.9v148.4Zm90.4 52.2-60.2-33.8v-71.7l60.2-33.8 60.2 33.8v71.7L256.6 325Zm38.7 155.7c-21.5 0-41.5-7.2-58.4-20l100.9-58.4c6.1-3.6 9.2-8.7 9.2-15.9V237.9l42.5 24.6c3.6 2 5.1 5.1 5.1 9.2v112.6c0 54.8-42.5 96.3-99.3 96.3ZM173.8 366.5l-97.7-56.3C47.9 293.8 29 259 29 225.2c0-39.4 23.6-74.8 59.9-89.6v116.7c0 7.2 3.1 12.3 9.2 15.9l128 74.2-42 24.1c-3.6 2-6.7 2-10.2 0Zm-5.6 84c-57.9 0-100.4-43.5-100.4-97.3 0-4.1.5-8.2 1-12.3l100.9 58.4c6.1 3.6 12.3 3.6 18.4 0l128.5-74.2v48.6c0 4.1-1.5 7.2-5.1 9.2l-97.8 56.3c-13.3 7.7-29.2 11.3-45.6 11.3Zm127 60.9c62 0 113.7-44 125.4-102.4 57.3-14.9 94.2-68.6 94.2-123.4 0-35.8-15.4-70.7-43-95.7 2.6-10.8 4.1-21.5 4.1-32.3 0-73.2-59.4-128-128-128-13.8 0-27.1 2-40.4 6.7-23-22.5-54.8-36.9-89.6-36.9-62 0-113.7 44-125.4 102.4C35.2 116.6-1.7 170.4-1.7 225.2c0 35.8 15.4 70.7 43 95.7-2.6 10.8-4.1 21.5-4.1 32.3 0 73.2 59.4 128 128 128 13.8 0 27.1-2 40.4-6.7 23 22.5 54.8 36.9 89.6 36.9Z" />
    </svg>
  );
}

export function AgentUsageIndicator() {
  const [providerStates, setProviderStates] = useState<Record<ProviderId, ProviderState>>({
    codex: { usage: null, error: null },
    claude: { usage: null, error: null },
  });
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [codex, claude] = await Promise.all(PROVIDERS.map(async ({ command }) => {
      try {
        return { usage: await requestUsage(command), error: null };
      } catch (cause) {
        return {
          usage: null,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }));
    setProviderStates({ codex, claude });
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (!pinned) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [pinned]);

  const providerDisplays = useMemo(() => PROVIDERS.map((provider) => {
    const state = providerStates[provider.id];
    return {
      ...provider,
      ...state,
      groups: state.usage ? getDisplayGroups(state.usage) : [],
      plan: state.usage?.rateLimits.planType,
    };
  }), [providerStates]);
  const windows = providerDisplays.flatMap((provider) =>
    provider.groups.flatMap((group) => group.windows),
  );
  const headline = windows.length > 0
    ? windows.reduce((highest, item) =>
        item.window.usedPercent > highest.window.usedPercent ? item : highest,
      )
    : null;
  const allFailed = providerDisplays.every((provider) => Boolean(provider.error));
  const label = headline
    ? `Agent usage, highest quota ${headline.window.usedPercent}% used. Show details`
    : allFailed
      ? "Agent usage unavailable. Show details"
      : "Loading agent usage";

  const closeUnlessPinned = () => {
    if (!pinned) setOpen(false);
  };

  return (
    <TooltipRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pinned) return;
        setOpen(nextOpen);
      }}
    >
      <TooltipTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="group flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
          aria-label={label}
          aria-pressed={pinned}
          onClick={() => {
            setPinned((current) => {
              const next = !current;
              setOpen(next);
              return next;
            });
          }}
          onPointerEnter={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onBlur={closeUnlessPinned}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setPinned(false);
            setOpen(false);
          }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,transform] group-hover:bg-hover group-active:scale-[0.96] motion-reduce:transition-none">
            <ChunkyUsageRing
              usedPercent={headline?.window.usedPercent}
              error={allFailed}
            />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent
      ref={contentRef}
      side="top"
      align="end"
      sideOffset={8}
      className="w-72 select-text overflow-hidden rounded-xl p-0 font-normal shadow-xl"
      onPointerEnter={() => setOpen(true)}
      >
        <div>
          <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-3.5">
            <ChunkyUsageRing
              usedPercent={headline?.window.usedPercent}
              error={allFailed}
            />
            <div className="text-[13px] font-semibold tracking-[-0.01em]">Usage</div>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {providerDisplays.map((provider) => (
              <section
                key={provider.id}
                className="px-3.5 py-3"
                aria-label={`${provider.name} usage`}
              >
                <div className="mb-2.5 flex items-center gap-2 text-primary">
                  <ProviderMark provider={provider.id} />
                  <div className="text-[11px] font-semibold">{provider.name}</div>
                  {provider.plan && (
                    <div className="ml-auto text-[10px] capitalize text-tertiary">{provider.plan}</div>
                  )}
                </div>
                {provider.groups.length > 0 ? (
                  <div className="space-y-3">
                    {provider.groups.flatMap((group) =>
                      group.windows.map((item) => {
                        const used = Math.min(100, Math.max(0, item.window.usedPercent));
                        const windowLabel = formatQuotaWindow(item.window.windowDurationMins);
                        const itemLabel = group.name === provider.name
                          ? windowLabel
                          : `${group.name} · ${windowLabel}`;
                        return (
                          <div key={item.id}>
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="min-w-0 truncate text-[11px] text-secondary">
                                {itemLabel}
                              </div>
                              <div className="shrink-0 text-[10px] text-tertiary">
                                {formatResetTime(item.window.resetsAt)}
                              </div>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tertiary">
                              <div
                                className="h-full rounded-full bg-semantic-info"
                                style={{ width: `${used}%` }}
                              />
                            </div>
                            <div className="mt-1 font-mono text-[10px] tabular-nums text-secondary">
                              {Math.round(used)}% Used
                            </div>
                          </div>
                        );
                      }),
                    )}
                  </div>
                ) : (
                  <p className="leading-4 text-secondary">
                    {provider.error ?? `Reading your signed-in ${provider.name} account…`}
                  </p>
                )}
              </section>
            ))}
          </div>
        </div>
      </TooltipContent>
    </TooltipRoot>
  );
}
