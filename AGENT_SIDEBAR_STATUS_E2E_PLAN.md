# Agent Sidebar Status E2E Plan

## Goal

- Show accurate per-worktree agent status in the sidebar:
  - `loading/running` while the agent is working
  - `ready` when the agent is waiting for user input
- Support multiple worktrees and concurrent sessions reliably.

## Current Baseline

- Sidebar already renders per-worktree process status:
  - `src/components/Sidebar.tsx:50`
  - `src/components/Sidebar.tsx:270`
- `WorktreeItem` already supports status visuals:
  - `src/components/WorktreeItem.tsx:7`
- Process polling hook exists:
  - `src/hooks/useProcessStatus.ts:6`
- Backend process scanning exists:
  - `src-tauri/src/commands/process.rs:124`
- Gaps:
  - `refreshProcessStatuses` is stubbed (`src/store/index.ts:572`)
  - process polling is not wired in `App`.

## Architecture Decision

- Use dual-source state:
  - event-driven lifecycle state as source of truth
  - process polling for reconciliation/fallback
- Keep agent lifecycle state separate from dev-server process state.

## Canonical State Model

```ts
type AgentRunStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting_input"
  | "completed"
  | "error";
```

```ts
type AgentRunState = {
  worktreePath: string;
  sessionId: string;
  terminalId?: string;
  status: AgentRunStatus;
  startedAt: number;
  lastEventAt: number;
  endedAt?: number;
  agent?: "opencode" | "claude" | "droid" | "amp" | "codex";
  label?: string;
  error?: string;
};
```

## Event Contract (Tauri -> Frontend)

```ts
type AgentStatusEvent = {
  worktreePath: string;
  sessionId: string;
  terminalId?: string;
  status: "starting" | "running" | "waiting_input" | "completed" | "error";
  timestamp: number;
  agent?: string;
  message?: string;
};
```

- Event name: `agent-status-changed`
- Frontend must ignore stale events when `sessionId` does not match current worktree session.

## End-to-End Implementation Plan

### Phase 1: Data model and store foundation

- Add lifecycle types in `src/types/index.ts`
- Extend Zustand store in `src/store/index.ts`:
  - `agentRunByWorktreePath: Record<string, AgentRunState | undefined>`
  - `setAgentRunState(event)`
  - `clearAgentRunState(worktreePath)`
  - `markAgentRunError(worktreePath, error)`
  - `reconcileAgentRunWithProcessPolling(...)`
- Keep existing `ProcessStatus` for dev-server signaling.

### Phase 2: Backend lifecycle emission

- In `src-tauri/src/commands/terminal.rs`, emit `agent-status-changed` for command-backed terminal sessions.
- Emit transitions:
  - `starting`: before spawn
  - `running`: first output received
  - `completed` or `error`: process exit + exit code
  - `waiting_input`: explicit signal when available
- Ensure registration/wiring in `src-tauri/src/lib.rs`.

### Phase 3: Waiting-for-input detection strategy

- Priority 1: explicit protocol signal from agent CLI
- Priority 2: known output markers per agent (regex map)
- Priority 3: guarded heuristic:
  - prompt boundary detected
  - inactivity window reached
  - no pending tool execution signals
- Never set `waiting_input` from inactivity alone if active stream/tool activity continues.

### Phase 4: Polling and reconciliation

- Implement `refreshProcessStatuses` in `src/store/index.ts:572` using `get_all_worktrees_process_status`.
- Wire `useProcessStatusPolling()` in `src/App.tsx`.
- Reconcile rules:
  - process exists + no event state -> restore/keep `running`
  - event state is `waiting_input` + process exists -> keep `waiting_input`
  - process gone + no close event -> timeout-based transition to `completed` or `error`.

### Phase 5: Sidebar UI states

- Extend `src/components/WorktreeItem.tsx`:
  - `starting/running`: spinner + "Agent running"
  - `waiting_input`: ready indicator + "Waiting for input"
  - `completed`: checkmark for short TTL, then idle
  - `error`: error indicator with message/tooltip
- Keep dev-server status as secondary signal.
- Display priority: agent lifecycle status > dev-server status text.

### Phase 6: Session correctness and race handling

- One current session per worktree for sidebar lifecycle state.
- New session supersedes previous session state.
- Ignore stale events (`sessionId` mismatch).
- On terminal close, update only current session for that worktree.

### Phase 7: Test plan (unit, integration, E2E)

- Unit tests:
  - lifecycle transitions
  - stale-event discard
  - reconciliation behavior
- Integration tests:
  - mocked Tauri lifecycle events update sidebar
  - polling restores state after reload
- E2E scenarios:
  - two worktrees with concurrent agents
  - one waiting input while another runs
  - rapid restart in same worktree
  - app reload during running session
  - process crash without close event
- UX latency goals:
  - event path < 500ms
  - fallback reconciliation <= polling interval.

### Phase 8: Rollout and observability

- Add transition logs:
  - `worktreePath`, `sessionId`, `from`, `to`, reason
- Add feature flag `agentSidebarLifecycleEnabled` for controlled rollout.
- Rollout order:
  - internal/dev first
  - verify false-ready and stuck-loading rates
  - enable by default.

## Acceptance Criteria

- Sidebar reflects per-worktree lifecycle state in near real-time.
- `waiting_input` appears accurately when user action is needed.
- No status leakage across worktrees.
- No permanent spinner after process exits.
- Reload recovers reasonable state within polling window.

## File-by-File Change Map

- `src/types/index.ts`
  - add `AgentRunStatus`, `AgentRunState`, `AgentStatusEvent`
- `src/store/index.ts`
  - add lifecycle store map + actions + reconciliation
  - implement `refreshProcessStatuses`
- `src/hooks/useProcessStatus.ts`
  - keep polling hook; add reconciliation trigger if needed
- `src/App.tsx`
  - wire `useProcessStatusPolling()`
- `src/components/WorktreeItem.tsx`
  - render lifecycle badge/spinner/ready/error
- `src/components/Sidebar.tsx`
  - pass agent lifecycle + process status into item
- `src-tauri/src/commands/terminal.rs`
  - emit lifecycle events
- `src-tauri/src/lib.rs`
  - ensure command/event registration and app wiring
