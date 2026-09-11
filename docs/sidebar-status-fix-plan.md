# Sidebar Running-Status Fix Plan

## Goal

Make sidebar agent status truthful and actionable across six worktrees: lifecycle states do not flicker, finished/error states remain visible long enough to notice, delayed events cannot overwrite newer state, and process presence is not mislabeled as active work.

## Verified current behavior

The plan is based on the current frontend and Rust paths, not on assumed behavior:

1. `AGENT_FINISHED_TTL_MS` is 5 seconds in `src/store/agentRunState.ts`. `getNextAgentFinishedDeadline` schedules cleanup through `src/hooks/useProcessStatus.ts`, so finished/error state really does disappear after that window.
2. `PROCESS_STATUS_LABELS.agent_running` is empty in `src/components/WorktreeItem.tsx`. When lifecycle events are disabled or unavailable, polling can render the warning dot with no text label.
3. `reconcileAgentRunState` already preserves every active lifecycle state, including `waiting_input`, while polling reports `agent_running`. When polling reports `none`, it converts the active state to `completed` with `Agent process exited`. The earlier claim that both poll values demote `waiting_input` was incorrect.
4. Managed agent terminals emit `completed` or `error` when the PTY reader exits in `src-tauri/src/commands/terminal.rs`. Polling remains necessary for externally launched agents and when `agentSidebarLifecycleEnabled` is off.
5. `setAgentRunState` rejects a terminal event for every unseen session unless its first status is active. A legitimate first `completed/error` event is therefore lost. It also lacks a general timestamp guard for delayed same-session events.
6. Process detection scans every process whose current directory is the worktree or a descendant and recognizes supported agent executables in `src-tauri/src/commands/process.rs`. There is not enough evidence that subagents currently cause the reported parent-exit bug, so that claim is removed from this fix.

## Required behavior

### State reconciliation (`src/store/agentRunState.ts`)

Keep the existing process/lifecycle relationship and change only the incorrect lifetime:

```text
undefined + agent_running          -> synthesized running
active + agent_running             -> preserve lifecycle state, including waiting_input
active + none                      -> completed (Agent process exited)
completed/error + agent_running    -> synthesized running for the detected process
completed/error + none             -> preserve for 30 minutes, then clear
```

- Change `AGENT_FINISHED_TTL_MS` from 5 seconds to `30 * 60 * 1000`.
- Do not make `waiting_input` survive a `none` poll indefinitely. Under the plan's explicit assumption that process detection is accurate, no detected process means the waiting state is stale.
- Starting a new session or deleting its worktree clears/replaces the finished state immediately through existing flows.

### Event ingestion (`src/store/agentRunState.ts`, `src/store/index.ts`)

Extract a pure `applyAgentStatusEvent(current, event)` function so ordering and session replacement can be tested without mounting the store.

- Drop any event whose `timestamp` is older than `current.lastEventAt`.
- Accept an event at the same timestamp only when it belongs to the current session; this prevents an ambiguous unseen session from replacing current state.
- Accept the first event for an unseen session regardless of status when its timestamp is newer. This preserves legitimate quick `completed/error` sessions.
- For the same session, preserve `startedAt` and replace the remaining event-derived fields.
- For a new session, set `startedAt` from the event timestamp and clear stale `endedAt/error` unless the incoming status is terminal.

This is intentionally still one displayed run per worktree. Supporting multiple independent agent terminals in one worktree requires an explicit aggregation model and is out of scope.

### Rendering (`src/components/WorktreeItem.tsx`)

- Label polling-only `agent_running` as `Agent open`, because polling proves process presence but not an active turn. Reserve `Agent running` for lifecycle state.
- Show activity text only when the row has no PR. When a PR exists, keep the compact activity icon and let the PR own the secondary status line.
- Extract a pure row resolver shared by the visible label and icon. Resolution order is lifecycle state, then process status, then PR status.
- Keep lifecycle color/icon semantics: error, waiting, running/starting, completed.
- Add the relative `lastEventAt` to the lifecycle tooltip so a 30-minute sticky result is visibly timestamped.
- Do not change the process polling cadence.

## Implementation order

1. **Reproduce and record baseline (30 minutes).** Verify the 5-second cleanup and blank polling-only label. Also run a forced out-of-order event sequence against the current store logic. The lifecycle-disabled case is sufficient for the blank-label baseline; it is not expected to expose `waiting_input` because polling cannot infer it.
2. **Fix pure state logic (60 minutes).** Add the TTL and event-ingestion tests, then implement the smallest changes in `agentRunState.ts` and delegate `setAgentRunState` to the new pure function.
3. **Fix rendering (45 minutes).** Add the polling fallback label and tooltip age through one pure resolver.
4. **Focused verification (30 minutes).** Run the focused Bun tests and file-targeted linting only.
5. **Live verification (2 hours elapsed, about 30 minutes active).** Exercise six worktrees using the protocol below. Remove temporary diagnostic logging before the final diff.

## Automated checks

Use `bun:test`; do not run a project-wide TypeScript check or a build that launches one.

- **T1 — TTL boundary:** completed and error remain at `endedAt + 30min - 1ms` and clear at `endedAt + 30min`.
- **T2 — reconciliation matrix:** cover every row in the table above, including `waiting_input + agent_running` staying waiting and `waiting_input + none` becoming completed.
- **T3 — deadline scheduling:** earliest terminal-state deadline wins; active/empty inputs return `undefined`.
- **T4 — event ordering:** same-session transitions work; older events are dropped; a newer unseen `completed/error` is accepted; equal-time unseen sessions are dropped; a newer session clears stale fields.
- **T5 — row resolution:** event states beat process state; `undefined + agent_running` resolves to `Agent open`; PR rows suppress activity text but retain its icon; `undefined + none` falls through to PR or idle.

Focused commands:

```sh
bun test tests/agent-run-state.test.ts tests/agent-event-ingest.test.ts tests/session-search.test.ts tests/worktree-status-display.test.ts
```

There is no ESLint dependency or lint script in `package.json`. Inspect editor/LSP diagnostics for touched files and record that evidence. Do not install a linter for this change or substitute a project-wide typecheck or build.

## Live acceptance protocol

Set up three running worktrees, one waiting for input, one quick-finish, and one idle worktree.

1. Finish one managed agent: `Agent finished` is visible at +1 minute and +10 minutes, and clears at +30 minutes or immediately after a newer session event.
2. End a running managed terminal: its terminal event or the next `none` poll produces a timestamped finished/error row, never an immediate blank idle row.
3. Disable `agentSidebarLifecycleEnabled`: a polled agent displays `Agent open` only on rows without a PR; no `waiting_input` claim is expected without events.
4. Feed the tested rapid-restart/out-of-order sequences: the newest event remains displayed.
5. Capture timestamps and screenshots for each state; record any mismatch between the Rust process result and the visible terminal.

## Acceptance

- [ ] A polling-only agent renders as `Agent open` when no PR exists and adds no status-line clutter when a PR exists.
- [ ] Finished/error persists for exactly the tested 30-minute window unless replaced by a newer session.
- [ ] `waiting_input` survives an `agent_running` poll but clears to finished after a truthful `none` poll.
- [ ] Older events cannot overwrite newer state; a newer terminal event can start or finish an unseen session.
- [ ] Focused tests and file-targeted lint pass; before/after live evidence is attached.

## Stop condition and follow-up boundary

This plan assumes Rust process detection is truthful. If live verification reports `none` while an agent process is demonstrably alive, stop this frontend fix and open a separate Rust detection issue with the process command, cwd, wrapper executable, and timestamps. Do not hide detector errors with faster polling or permanently sticky UI state.
