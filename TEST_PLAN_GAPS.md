# TEST_PLAN.md — Missing Implementation Items

This document lists the gaps between `TEST_PLAN.md` and the current codebase.

## Current Status

- Frontend test setup exists (`vitest.config.ts`, `src/test/setup.ts`, `package.json` scripts)
- CI test workflow exists (`.github/workflows/test.yml`)
- Many frontend unit tests exist
- Rust unit tests exist in several command modules
- **But the plan is not fully implemented**

## 1. Current Failures

### Frontend test suite is not fully green

`bun run test:run` currently has **1 failing test**:

- `src/hooks/__tests__/useCodeReview.test.ts`
  - failing test: `defaults to local mode when no saved diffMode`

There are also multiple test warnings/noise during the run:

- React `act(...)` warnings in several hook/component tests
- DOM prop warning in `UpdateNotification` (`showClose` prop reaching DOM)

## 2. E2E Test Coverage Missing

The plan calls for Playwright or WebdriverIO E2E coverage, but this is currently missing.

### Missing
- Playwright/WebdriverIO setup
- E2E config files
- E2E test directory/files
- Critical-path end-to-end scenarios

### Planned but missing scenarios
- Add repository
- Create worktree
- Terminal interaction
- PR workflow
- Diff viewing
- Git operations
- Settings persistence
- Agent launch
- Command palette flow
- Multi-repo flow

## 3. Component Tests Missing

The plan calls for broader component coverage than currently exists.

### Already present
- `src/components/__tests__/CommandMenu.test.tsx`
- `src/components/__tests__/Navbar.test.tsx`
- `src/components/__tests__/NewWorktreeDialog.test.tsx`
- `src/components/__tests__/PRStatusBadge.test.tsx`
- `src/components/__tests__/SettingsPanel.test.tsx`
- `src/components/__tests__/UpdateNotification.test.tsx`
- `src/components/__tests__/WorktreeItem.test.tsx`

### Missing component tests from the plan
- `src/components/__tests__/Sidebar.test.tsx`
- `src/components/__tests__/TerminalGrid.test.tsx`
- `src/components/__tests__/DiffOverlay.test.tsx`
- `src/components/__tests__/GitFileDiffOverlay.test.tsx`

### Missing RightPanel tab tests
- `src/components/__tests__/RightPanel/GitTab.test.tsx`
- `src/components/__tests__/RightPanel/DiffTab.test.tsx`
- `src/components/__tests__/RightPanel/ChangesTab.test.tsx`
- `src/components/__tests__/RightPanel/CommentsTab.test.tsx`
- `src/components/__tests__/RightPanel/ChecksTab.test.tsx`

## 4. Hook Coverage Gaps

### `useProcessStatus` is not fully implemented as real hook tests

`src/hooks/__tests__/useProcessStatus.test.ts` is mostly a placeholder / structure-verification file, not a full functional hook test suite.

### Missing functional coverage from the plan
- does nothing when not initialized
- does nothing when repositories array is empty
- calls `refreshProcessStatuses` immediately on mount
- sets up polling interval behavior
- visibility-change behavior
- cleanup behavior on unmount
- dependency change behavior

## 5. Integration Test Gaps

`src/test/integration/tauri-commands.test.ts` exists, but it does not fully cover the integration cases described in the plan.

### Missing or incomplete
- `selectWorktree()` → verifies `spawn_terminal`
- `deleteWorktree()` → verifies full sequence (`close_terminals` then `delete_worktree`)
- `refreshProcessStatuses()` → verifies `get_all_worktrees_process_status`
- stronger payload/ordering assertions for command flows

## 6. Rust Backend Test Gaps

Rust tests exist, but the heavy command-level coverage described in the plan is still missing.

### 6.1 `src-tauri/src/commands/git.rs`

#### Currently covered
- synthetic patch builder
- last modified helper
- basic worktree branch lookup

#### Missing from the plan
- `discover_repository`
- `discover_repository_invalid`
- `list_worktrees`
- `list_worktrees_empty_repo`
- `get_worktree_branch_name`
- `get_worktrees_diff_stats`
- `create_worktree_auto`
- `delete_worktree`
- `get_changed_files`
- `get_file_diff`
- `get_uncommitted_files`
- `get_git_status`
- `git_stage_files`
- `git_unstage_files`
- `git_stage_all`
- `git_commit`
- `git_push`
- `git_revert_file`
- `generate_commit_message`

### 6.2 `src-tauri/src/commands/github.rs`

#### Currently covered
- `compute_checks_status`
- some PR response deserialization
- merge strategy flag mapping

#### Missing from the plan
- `check_gh_cli_not_installed`
- `get_pr_for_branch_no_pr`
- broader review decision mapping validation
- PR creation response parsing
- PR details comments parsing
- merge strategy command behavior coverage

### 6.3 `src-tauri/src/commands/process.rs`

#### Currently covered
- dev server detection helpers
- AI agent detection helpers
- worktree-path matching helper

#### Missing from the plan
- `get_process_status_none`
- `get_process_status_dev_server`
- `get_all_worktrees_status`

### 6.4 `src-tauri/src/commands/cli_tools.rs`

This area is mostly aligned with the plan, but only helper-level behavior is covered.

## 7. Snapshot / Regression Testing Missing

The plan mentions snapshot/regression testing, but it is not implemented.

### Missing
- store snapshots
- PR status mapping snapshots
- component snapshots where useful
- Rust output snapshots with `insta`

### Evidence
- `src-tauri/Cargo.toml` has `tempfile` in dev-dependencies
- `insta` is not present
- no snapshot test files were found

## 8. Coverage Goal Tracking Missing

The plan defines coverage goals, but there is no evidence that the codebase is currently enforcing or reporting against those targets.

### Missing / not yet verified
- Zustand store at 90%+
- Rust commands at 80%+
- Hooks at 75%+
- Utilities/lib at 90%+
- Components at 60%+
- clear reporting against these targets in CI

## 9. Plan Items Only Partially Implemented

### Phase 1 — mostly done
- Vitest setup
- store tests
- utility/type tests
- some Rust helper tests

### Phase 2 — partial
- hook tests exist, but one suite is failing and `useProcessStatus` is not fully real
- Rust git/github test depth is still limited

### Phase 3 — partial
- some component tests exist
- many planned components and RightPanel tabs are missing
- integration coverage is incomplete

### Phase 4 — not started
- no E2E setup
- no critical path E2E coverage

## Recommended Next Steps

1. Fix the failing frontend test in `src/hooks/__tests__/useCodeReview.test.ts`
2. Replace `useProcessStatus` placeholder tests with real hook tests
3. Add missing component tests:
   - `Sidebar`
   - `TerminalGrid`
   - `DiffOverlay`
   - RightPanel tabs
4. Expand integration tests for command sequencing and terminal spawning
5. Add real temp-repo Rust tests for `git.rs`
6. Expand `github.rs` and `process.rs` command-level tests
7. Add E2E framework and cover critical user journeys
8. Add snapshot/regression testing if still desired by the plan
