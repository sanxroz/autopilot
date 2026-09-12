# Parallel Worktrees Context-Switch Plan

## Goal

Make six concurrent worktrees manageable without rereading terminal transcripts: locating a session that needs attention takes under 10 seconds, and the existing `.autopilot.md` handoff makes resuming it take under 30 seconds.

This plan deliberately reuses `.autopilot.md`. Replacing it with a second structured state store would create two sources of truth and currently has no reliable agent-to-app update protocol.

## Dependency

Implement `docs/sidebar-status-fix-plan.md` first. The switcher uses lifecycle and process state to rank attention, so context-switch measurements are not valid until those labels and lifetimes are truthful.

## Verified current behavior

1. `.autopilot.md` is already the agent-facing, per-worktree handoff. Rust creates it, atomically reads/writes it, excludes it from Git, caps it at 1 MB, and `NotesTab` refreshes external edits every 2 seconds.
2. Personal sidebar notes are separate app-store data in `sidebarNotesByWorktreePath`. They are not `.autopilot.md` and must not be migrated or merged with it.
3. `CommandMenu` already computes attention/search labels and groups attention first, but it does not load or display `.autopilot.md` content.
4. `selectWorktree` already restores terminal tabs and the active terminal ID from `terminalsByWorktree`. The missing behavior is DOM focus after selection, not terminal-state persistence.
5. `rightPanelTab` is global React state in `App.tsx`; it does not reset on every selection. `gitFileDiffPreview` is intentionally cleared. Per-worktree Notes scroll position is browser component state and has no existing persistence contract.
6. `Mod+[` / `Mod+]` follows current sidebar order. There is no MRU list or `Ctrl+Tab` action.

## Required design

### 1. Read-only context summaries from the existing handoff

Add one bounded Rust command that returns summaries for requested worktree roots:

```ts
type WorktreeContextSummary = {
  preview: string;       // at most 160 Unicode characters
  updatedAt: number | null;
  hasMore: boolean;
};

type WorktreeContextSummaryResult =
  | { worktreePath: string; ok: true; summary: WorktreeContextSummary }
  | { worktreePath: string; ok: false; error: "invalid_worktree" | "malformed" | "unreadable" };
```

- Return one `WorktreeContextSummaryResult` per requested root in request order so callers can update successful cache entries while preserving prior summaries for failed roots.
- Reuse `validate_worktree` and join `.autopilot.md` without calling the mutating `prepare_autopilot_context` helper.
- Inspect at most a fixed 8 KiB prefix per file; do not transfer six potentially 1 MB files merely to render previews.
- Derive `preview` from the first non-empty prose line, skipping Markdown headings, horizontal rules, and empty list markers. Collapse internal whitespace and truncate on Unicode scalar boundaries.
- Only use complete eligible lines within the 8 KiB prefix. If it contains no prose, return an empty preview and set `hasMore: true` when unread bytes remain; never scan beyond the cap. Otherwise, `hasMore` reports either unread source bytes or preview truncation.
- Return empty preview and `updatedAt: null` for a missing/empty file. A malformed or unreadable file returns a per-path error/result rather than failing summaries for every worktree.
- This command is read-only. `NotesTab` remains the only app editor, and agents keep editing the same file directly.

No heuristic migration is required, and no user-authored Markdown is modified.

### 2. Cache and refresh summaries

Add `contextSummaryByWorktreePath` to the frontend store as runtime state, not persisted state.

- Refresh summaries after repositories initialize, when `CommandMenu` opens, and when the existing `autopilot-context-changed` event reports its exact `worktree_path`.
- Coalesce overlapping refreshes using the repository's existing task-coalescing pattern.
- Prune summaries for removed worktrees.
- A refresh failure preserves the last successful summary and exposes no destructive fallback.

Runtime caching avoids stale duplicated persistence; `.autopilot.md` remains authoritative after restart.

### 3. Attention-first command menu

- Keep all sessions visible when the menu opens. Do not silently pre-apply `/waiting`, because that hides running and other attention sessions.
- Sort zero-query results by stable buckets: waiting input, agent error, agent finished, PR attention/ready, running, then remaining sessions. Preserve existing sidebar order within each bucket.
- Keep explicit slash filters unchanged. Typed text searches repo, branch, path, PR/status labels, and context preview.
- Show branch, repo, existing status dots, the 160-character context preview, and relative summary age.
- After `selectWorktree` resolves, focus the restored `currentActiveTerminalId` on the next animation frame.

This yields one predictable zero-query view while retaining `/waiting` for users who want only blocked sessions.

### 4. MRU switching without duplicating terminal state

- Add persisted `recentWorktreePaths: string[]`, capped at 10, deduped, and pruned when worktrees disappear.
- Update MRU only after a different worktree is successfully selected. A failed terminal spawn must not reorder history.
- Add separate `previousRecentSession` and `nextRecentSession` shortcut actions for `Ctrl+Shift+Tab` and `Ctrl+Tab`.
- Keep `Mod+[` / `Mod+]` on sidebar/spatial order.
- Reuse `currentActiveTerminalId` from `terminalsByWorktree`; do not add `sessionUiByPath.activeTerminalId`.

### 5. Explicitly deferred behavior

Do not add structured `goal/status/next/blocked` storage, Markdown migration, subagent rollups, active-agent caps, per-worktree panel-tab persistence, Notes scroll restoration, or cross-worktree semantic search in this change. Each adds a second state model or an unvalidated interaction and is not required to meet the two timing goals.

If dogfooding shows that a 160-character handoff preview cannot achieve the 30-second resume target, the follow-up is a versioned schema inside `.autopilot.md` plus an explicit CLI/agent update contract—not heuristic parsing of the first four lines.

## File-by-file scope

| File | Change |
|---|---|
| `src-tauri/src/commands/notes.rs` | Add bounded multi-worktree context-summary command and Rust unit tests |
| `src-tauri/src/lib.rs` or command registration module | Register the new command |
| `src/types/index.ts` | Add summary type and MRU store fields/actions |
| `src/store/index.ts` | Runtime summary cache/refresh; persisted MRU update/pruning |
| `src/hooks/useGitWatcher.ts` | Listen for the existing path-specific `autopilot-context-changed` event and refresh that summary |
| `src/lib/session-navigation.ts` | Add pure MRU ordering/cycling helper |
| `src/lib/session-search.ts` | Add pure zero-query priority and preview search input |
| `src/components/CommandMenu.tsx` | Render summary/age, refresh on open, focus after selection |
| `src/lib/keyboard-shortcuts.ts`, `src/App.tsx`, `src/components/KeyboardShortcutsHelp.tsx` | Add and wire MRU shortcuts |

The existing Rust watcher already debounces root `.autopilot.md` changes and emits `autopilot-context-changed` with `worktree_path`. Reuse it; do not add a second filesystem watcher.

## Implementation order

1. **Baseline (30 minutes).** With six representative sessions, record ten zero-query `Cmd+K` attempts: target state, find time, and wrong selection. Record resume time from selection until the user can state the goal and next action from `.autopilot.md`.
2. **Summary reader (60 minutes).** Implement and test bounded extraction in Rust. Prove missing, empty, Unicode, heading-heavy, oversized, unreadable, and mixed-success inputs.
3. **Runtime cache and menu (90 minutes).** Load summaries, add stable attention ranking and preview search, then focus the restored terminal after selection.
4. **MRU shortcuts (60 minutes).** Implement pure ordering, persistence, successful-selection updates, deletion pruning, and shortcut wiring.
5. **Focused verification (30 minutes).** Run only the listed focused tests and file-targeted linting.
6. **Dogfood (one working day).** Use six real worktrees, then compare the same timing measures with baseline. Remove diagnostic logging and reduce the diff before merge.

## Automated checks

- **T1 — summary extraction (Rust):** skips structural Markdown, collapses whitespace, truncates Unicode safely at 160 characters, reports `hasMore`, and never mutates the source.
- **T2 — multi-read isolation (Rust):** one missing/unreadable worktree does not discard successful summaries; invalid non-worktree paths are rejected per path.
- **T3 — attention ranking:** bucket order matches the required design and remains stable within each bucket; no waiting session leaves other sessions inaccessible.
- **T4 — search:** text matches the context preview while slash filters and status matching keep existing behavior.
- **T5 — MRU:** successful selection pushes front, dedupes, caps at 10, and deletion prunes; failed selection and reselecting the active worktree do not create false history.
- **T6 — navigation/shortcuts:** recent cycling wraps predictably; spatial shortcuts are unchanged; every default binding and alias remains unique.
- **T7 — persistence:** MRU survives store reload; context summaries are reconstructed from disk rather than persisted.

Focused commands:

```sh
bun test tests/session-navigation.test.ts tests/session-search.test.ts tests/keyboard-shortcuts.test.ts tests/session-mru.test.ts
cargo test --manifest-path src-tauri/Cargo.toml commands::notes::tests
```

There is no ESLint dependency or lint script in `package.json`. Inspect editor/LSP diagnostics for touched files and record that evidence. Do not install a linter for this change, run a project-wide TypeScript check, or replace it with a build that implicitly runs one.

## Live acceptance protocol

Use six worktrees: one waiting for input, one agent error, one recently finished, one running, one PR needing attention, and one idle. Give every worktree a realistic `.autopilot.md`, including one empty and one heading-heavy file.

1. Open `Cmd+K` ten times from varied sessions and select the waiting/error target. Record median and worst-case time plus wrong selections.
2. Run ten alternating switches with `Ctrl+Tab` MRU and `Mod+[` spatial navigation. Record intended and landed worktree.
3. Edit `.autopilot.md` externally and confirm the menu preview updates without app restart or data modification.
4. Restart the app and verify MRU reloads, summaries reconstruct from disk, terminal tabs/active IDs still restore, and selection returns keyboard focus to the terminal.
5. Inspect all source `.autopilot.md` files byte-for-byte before and after the protocol; the summary feature must cause zero changes.

## Acceptance

- [ ] Median zero-query `Cmd+K` target time is under 10 seconds over ten attempts, with zero wrong selections caused by ordering.
- [ ] Median resume time is under 30 seconds using the visible preview and existing Notes content.
- [ ] All sessions remain reachable in the zero-query menu even when one is waiting.
- [ ] External handoff edits appear without restart; source Markdown is unchanged by summary reads.
- [ ] MRU and spatial navigation land on the intended worktree in all ten switches and remain distinct behaviors.
- [ ] Restart preserves MRU and existing terminal restoration; summaries reload from `.autopilot.md`.
- [ ] Focused tests and file-targeted lint pass; baseline and after measurements are attached.

## Rollout

1. Land the sidebar-status fix and validate its live evidence.
2. Land context summaries and attention ranking.
3. Land MRU shortcuts after summary/ranking acceptance passes.
4. Consider a structured handoff schema only if one week of real use misses the resume-time target and the failures show that preview quality—not stale handoff content—is the cause.
