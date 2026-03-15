# Autopilot — Comprehensive Test Plan

## 1. Overview

**Autopilot** is a Tauri v2 desktop app (React + Rust) for managing git worktrees with integrated terminals, GitHub PR workflows, AI agent orchestration, and diff viewing. This plan covers testing at every layer to catch regressions and validate default behaviors.

### Architecture Summary
| Layer | Stack | Key Areas |
|-------|-------|-----------|
| **Frontend** | React 19, Zustand, Vite, TailwindCSS | Store logic, hooks, UI components, utilities |
| **Backend** | Rust (Tauri commands) | Git ops, GitHub CLI, terminal PTY, file watcher, process detection |
| **Integration** | Tauri IPC (`invoke`) | Frontend ↔ Backend communication |
| **E2E** | Full app | User workflows end-to-end |

---

## 2. Testing Layers & Tools

| Layer | Tool | Why |
|-------|------|-----|
| **Rust unit tests** | `cargo test` (built-in) | Test git commands, GitHub parsing, process detection in isolation |
| **Frontend unit tests** | **Vitest** + **React Testing Library** | Test store logic, hooks, utilities, component rendering |
| **Component tests** | **Vitest** + **RTL** | Test UI components with mocked Tauri APIs |
| **E2E tests** | **Playwright** (or **WebdriverIO** with Tauri driver) | Full user workflow validation |

---

## 3. Setup & Configuration

### 3.1 Frontend Testing (Vitest)

```bash
bun add -d vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

**`vitest.config.ts`**:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/vite-env.d.ts', 'src/main.tsx'],
    },
  },
});
```

**`src/test/setup.ts`**:
```ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs globally
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({
    get: vi.fn(),
    set: vi.fn(),
    save: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { create: vi.fn() },
}));
```

**`package.json` scripts**:
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:rust": "cd src-tauri && cargo test"
  }
}
```

### 3.2 Rust Testing (cargo test)

Tests live alongside source code in `src-tauri/src/commands/*.rs` using `#[cfg(test)]` modules. No extra setup needed — Rust has built-in testing.

---

## 4. Test Suites — Detailed Breakdown

### 4.1 🦀 Rust Backend Unit Tests

#### 4.1.1 `commands/git.rs` — Git Operations
**File**: `src-tauri/src/commands/git.rs` (1404 lines — highest priority)

| Test | What it validates | Default behavior |
|------|-------------------|-----------------|
| `test_discover_repository` | `discover_repository()` finds repo info from a valid path | Returns `RepoInfo` with correct name and path |
| `test_discover_repository_invalid` | Error on non-repo path | Returns descriptive error string |
| `test_list_worktrees` | `list_worktrees()` returns all worktrees with metadata | Returns vec of `WorktreeInfo` with branches, last_modified |
| `test_list_worktrees_empty_repo` | Repo with no extra worktrees | Returns at least the main worktree |
| `test_get_worktree_branch_name` | Extracts branch name from worktree | Returns `Some("branch-name")` or `None` for detached HEAD |
| `test_get_worktrees_diff_stats` | Diff stats calculation (additions/deletions) | Correct counts for modified files |
| `test_create_worktree_auto` | Auto-generates worktree name and creates it | Worktree created with random name, branch matches |
| `test_delete_worktree` | Removes worktree cleanly | Directory removed, branch cleaned up |
| `test_get_changed_files` | Lists changed files vs main/master | Returns `Vec<ChangedFile>` with correct statuses |
| `test_get_file_diff` | Generates diff for a single file | Returns `FileDiffData` with patch, old/new content |
| `test_get_uncommitted_files` | Lists unstaged/staged changes | Correct file statuses |
| `test_get_git_status` | Full git status (staged, unstaged, ahead/behind) | Complete `GitStatus` struct |
| `test_git_stage_files` | Stages specific files | Files appear in staged after call |
| `test_git_unstage_files` | Unstages specific files | Files move back to unstaged |
| `test_git_stage_all` | Stages all changes | No unstaged files remain |
| `test_git_commit` | Creates commit with message | Returns commit SHA, working tree is clean |
| `test_git_push` | Pushes to remote | No error on valid remote (mock or skip in CI) |
| `test_git_revert_file` | Reverts a file to HEAD | File content matches HEAD version |
| `test_generate_commit_message` | AI commit message generation | Returns non-empty string (mock CLI tool) |
| `test_build_synthetic_patch` | Internal patch builder for new files | Correct diff format with `@@ -0,0 +1,N @@` |

**Testing approach**: Create temp git repos with `git2` in test setup, perform operations, assert results. Use `tempfile::TempDir` for isolation.

#### 4.1.2 `commands/github.rs` — GitHub CLI Integration
**File**: `src-tauri/src/commands/github.rs` (820 lines)

| Test | What it validates |
|------|-------------------|
| `test_compute_checks_status_all_success` | Returns `"success"` when all checks pass |
| `test_compute_checks_status_has_failure` | Returns `"failure"` when any check fails |
| `test_compute_checks_status_pending` | Returns `"pending"` when checks are in progress |
| `test_compute_checks_status_empty` | Returns `None` for no checks |
| `test_parse_gh_pr_response` | Correctly deserializes `gh` CLI JSON output |
| `test_check_gh_cli_not_installed` | Graceful handling when `gh` is not found |
| `test_get_pr_for_branch_no_pr` | Returns `None` when no PR exists for branch |
| `test_pr_status_draft_detection` | `draft` field correctly parsed |
| `test_pr_review_decision_mapping` | Maps `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED` |
| `test_create_pr_response_parsing` | Parses PR creation result (number, url) |
| `test_get_pr_details_comments_parsing` | Correctly parses comment types (issue, review, review_thread) |
| `test_merge_pr_strategies` | Merge, squash, rebase strategies work |

**Testing approach**: Mock `gh` CLI output with known JSON strings. Test `compute_checks_status` and parsing functions directly as unit tests.

#### 4.1.3 `commands/process.rs` — Process Detection
**File**: `src-tauri/src/commands/process.rs` (178 lines)

| Test | What it validates |
|------|-------------------|
| `test_get_process_status_none` | Returns `"none"` for path with no running processes |
| `test_get_process_status_dev_server` | Detects dev server processes |
| `test_get_all_worktrees_status` | Batch status check returns correct map |

#### 4.1.4 `commands/cli_tools.rs` — CLI Tool Discovery
**File**: `src-tauri/src/commands/cli_tools.rs` (240 lines)

| Test | What it validates |
|------|-------------------|
| `test_find_cli_tool_exists` | Finds a known tool (e.g., `git`) |
| `test_find_cli_tool_not_found` | Returns error for nonexistent tool |
| `test_cache_behavior` | Second lookup uses cache |
| `test_clear_cache` | Cache is cleared properly |

---

### 4.2 ⚛️ Frontend Unit Tests

#### 4.2.1 Zustand Store (`src/store/index.ts`) — **HIGHEST PRIORITY**
**File**: `src/store/index.ts` (956 lines — the core of the app)

**File**: `src/store/__tests__/store.test.ts`

| Test Group | Tests | Default Behavior Validated |
|-----------|-------|---------------------------|
| **Initialization** | `initializes with default state` | All defaults: empty repos, no selected worktree, no terminals, settings closed |
| | `initialize() loads persisted repos` | Repos restored from Tauri store |
| **Repository Management** | `addRepository() adds repo and refreshes worktrees` | Repo added to list, worktrees fetched |
| | `addRepository() deduplicates paths` | Same path not added twice |
| | `removeRepository() removes and cleans up` | Repo removed, watchers stopped, terminals closed |
| | `toggleRepoExpanded()` | Toggles `isExpanded` flag |
| | `toggleRepoCollapsed()` | Toggles collapsed set membership |
| **Worktree Selection** | `selectWorktree() sets current worktree` | `selectedWorktree` updated |
| | `selectWorktree() restores terminals` | Terminals from `terminalsByWorktree` loaded |
| | `selectWorktree() creates default terminal if none` | At least 1 terminal always exists |
| **Terminal Management** | `addTerminal() creates terminal with UUID` | New terminal added to currentTerminals |
| | `addTerminalWithCommand() spawns with command` | Terminal created and command sent |
| | `removeTerminal() cleans up` | Terminal removed, active switched to another |
| | `setActiveTerminal()` | Updates `currentActiveTerminalId` |
| | `removeTerminal() when last terminal` | `currentActiveTerminalId` becomes null |
| **UI State Toggles** | `toggleSettings()` | Flips `settingsOpen` |
| | `toggleCodeReview()` | Flips `codeReviewOpen` |
| | `toggleDiffOverlay()` | Flips `diffOverlayOpen` |
| | `toggleDiffViewMode()` | Alternates between `'overlay'` and `'sidebar'` |
| | `setDiffViewMode('sidebar')` | Sets exactly to given mode |
| | `setGitFileDiffPreview()` | Sets and clears preview object |
| **PR Status** | `setPRStatusBatch()` | Merges new batch into existing statuses |
| | `setPRDataCache()` / `getPRDataCache()` | Caches and retrieves with TTL |
| | `getPRDataCache() expired entry` | Returns `null` after 5 min TTL |
| | `clearPRDataCacheForRepo()` | Only removes entries for that repo |
| **GitHub Settings** | `checkGitHubCli()` updates settings | Sets `ghCliAvailable` and `ghAuthUser` |
| | `setPollingInterval()` | Updates `pollingIntervalMs` |
| **Agent State** | `setAgentRunState()` creates/updates run state | Correct status transitions |
| | `clearAgentRunState()` | Removes entry for worktree |
| | `markAgentRunError()` | Sets error status and message |
| | `reconcileAgentRunWithProcessPolling()` | Syncs agent state with process detection |
| **AI Agent Config** | `setDefaultAIAgent()` persists selection | Stored and persisted to Tauri store |
| **Addressed Comments** | `toggleAddressedComment()` | Adds/removes comment from set |
| | `isCommentAddressed()` | Returns boolean correctly |
| | `getAddressedCount()` | Returns correct count |
| | `clearAddressedComments()` | Clears all for repo+PR |
| **Diff Stats** | `updateWorktreeDiffStats()` | Updates diff_stats on matching worktrees |
| **Theme** | `setThemeMode()` | Calls global setter and persists |
| **Worktree CRUD** | `createWorktreeAuto()` | Invokes backend and refreshes list |
| | `deleteWorktree()` closes terminals first | Terminals closed before deletion |

#### 4.2.2 Hooks

**`src/hooks/__tests__/usePRStatus.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `usePRStatusForBranch returns null when no branch` | Returns `null` |
| `usePRStatusForBranch returns null when no repo statuses` | Returns `null` |
| `usePRStatusForBranch returns PR status when available` | Returns matching `PRStatus` |
| `usePRStatusPolling starts polling on mount` | Sets interval with `pollingIntervalMs` |
| `usePRStatusPolling skips fetch when ghCli unavailable` | No invocations |
| `usePRStatusPolling skips collapsed repos` | Only fetches visible repos |
| `usePRStatusPolling cleans up on unmount` | Clears interval |

**`src/hooks/__tests__/useCodeReview.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `launches cubic review and parses output` | Sets loading, returns result |
| `handles review failure gracefully` | Error state set, no crash |

**`src/hooks/__tests__/useGitWatcher.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `starts watching on repo add` | Calls `start_watching_repository` |
| `stops watching on repo remove` | Calls `stop_watching_repository` |
| `refreshes on file change event` | Triggers worktree refresh |

**`src/hooks/__tests__/useProcessStatus.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `polls process statuses periodically` | Calls `refreshProcessStatuses` on interval |

**`src/hooks/__tests__/useDiffStats.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `fetches and updates diff stats` | Updates store with fetched stats |

**`src/hooks/__tests__/useUpdater.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `checks for updates on mount` | Calls updater API |
| `shows notification when update available` | Returns update info |
| `no notification when up to date` | Returns null |

#### 4.2.3 Utilities

**`src/utils/__tests__/cn.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `merges class names correctly` | Produces merged tailwind classes |
| `handles conditional classes` | Falsy values excluded |

**`src/lib/__tests__/diff-highlighter.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `processAST produces correct line mapping` | Line numbers and indices correct |
| `processAST handles multiline text nodes` | Splits correctly across lines |
| `ignored files return undefined AST` | Files in ignore list skipped |
| `hasRegisteredCurrentLang for supported lang` | Returns `true` for TypeScript etc. |
| `hasRegisteredCurrentLang for unsupported lang` | Returns `false` |

**`src/lib/__tests__/animations.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `EASING values are valid cubic-bezier arrays` | 4 numbers, all in [0,1] (approximately) |
| `ANIMATION.duration values are reasonable` | All positive, micro < fast < base < normal < slow |

#### 4.2.4 Types Validation

**`src/types/__tests__/types.test.ts`**
| Test | Default Behavior |
|------|-----------------|
| `AI_AGENTS has all expected agents` | 5 agents: opencode, claude, droid, amp, codex |
| `AI_AGENTS have required fields` | Each has id, name, command, promptFlag |
| `DEFAULT_GITHUB_SETTINGS has correct defaults` | 30s polling, ghCli false, no user |
| `POLLING_INTERVALS are ordered` | fast < normal < slow |

---

### 4.3 🖥️ Component Tests

**Priority components** (test rendering + interactions, mock all Tauri calls):

| Component | Key Tests |
|-----------|-----------|
| `Sidebar` | Renders repo list, expand/collapse repos, select worktree, shows PR badges |
| `WorktreeItem` | Displays branch name, diff stats, process indicator, context menu actions |
| `Navbar` | Shows selected worktree info, settings button, theme toggle |
| `TerminalGrid` | Renders terminal tabs, add/remove/switch terminals |
| `CommandMenu` | Opens on shortcut, searches commands, executes action |
| `SettingsPanel` | Renders all settings, saves changes, theme selector |
| `PRStatusBadge` | Shows correct icon/color for each PR state (draft, approved, changes requested, merged) |
| `DiffOverlay` | Renders diff view, toggles split/unified mode |
| `GitFileDiffOverlay` | Shows file diff with syntax highlighting |
| `NewWorktreeDialog` | Form validation, calls createWorktreeAuto |
| `UpdateNotification` | Shows when update available, dismiss works |
| **RightPanel tabs** | |
| `RightPanel/GitTab` | Shows git status, stage/unstage files, commit flow |
| `RightPanel/DiffTab` | Shows changed files with diff stats |
| `RightPanel/ChangesTab` | Lists changes, stage/unstage interactions |
| `RightPanel/CommentsTab` | Shows PR comments, addressed toggle |
| `RightPanel/ChecksTab` | Shows CI check statuses |

---

### 4.4 🔗 Integration Tests

Test the Tauri IPC boundary by validating that frontend `invoke()` calls map to correct backend commands with expected payloads:

**`src/test/integration/tauri-commands.test.ts`**
| Test | What it validates |
|------|-------------------|
| `store.addRepository invokes discover_repository` | Correct command name and payload |
| `store.refreshWorktrees invokes list_worktrees` | Passes repo path |
| `store.selectWorktree invokes spawn_terminal` | Terminal spawned with correct worktree path |
| `store.deleteWorktree invokes close_terminals then delete_worktree` | Correct sequence of calls |
| `store.createWorktreeAuto invokes create_worktree_auto` | Passes repo path |
| `checkGitHubCli invokes check_gh_cli and check_gh_auth` | Sequential calls |
| `refreshProcessStatuses invokes get_all_worktrees_process_status` | Passes all worktree paths |

---

### 4.5 🧪 E2E Tests (Future Phase)

Using Playwright with Tauri's WebView or WebdriverIO:

| Scenario | Steps |
|----------|-------|
| **Add repository** | Open app → Add repo → Verify sidebar shows repo with worktrees |
| **Create worktree** | Select repo → New worktree → Verify appears in sidebar |
| **Terminal interaction** | Select worktree → Type command → Verify output |
| **PR workflow** | Select worktree with PR → Check PR badge → Open checks tab → Verify status |
| **Diff viewing** | Select worktree → Open diff → Toggle split/unified → Verify rendering |
| **Git operations** | Modify file → Stage → Commit → Verify status updates |
| **Settings persistence** | Change theme → Restart → Verify theme persisted |
| **Agent launch** | Select agent → Start → Verify status transitions |
| **Command palette** | Open (Cmd+K) → Search → Execute command |
| **Multi-repo** | Add 2 repos → Switch between → Verify independent state |

---

## 5. Implementation Priority

### Phase 1 — Foundation (Week 1) ✅ Quick wins, high coverage
1. **Setup Vitest** with Tauri mocks (`src/test/setup.ts`)
2. **Zustand store tests** — the entire store (highest ROI, pure logic)
3. **Rust unit tests** for `compute_checks_status`, CLI tool finder, git parsing helpers
4. **Type/constant validation** tests
5. **Utility tests** (`cn`, `animations`, `diff-highlighter/processAST`)

### Phase 2 — Hooks & Logic (Week 2)
6. **Hook tests** — `usePRStatus`, `useGitWatcher`, `useProcessStatus`, `useDiffStats`
7. **Rust git command tests** with temp repos (`discover_repository`, `list_worktrees`, etc.)
8. **Rust github parsing tests** with mock JSON

### Phase 3 — Components (Week 3)
9. **Component tests** — Start with `Sidebar`, `WorktreeItem`, `PRStatusBadge`, `CommandMenu`
10. **RightPanel tab tests** — `GitTab`, `CommentsTab`, `ChecksTab`
11. **Integration tests** — verify `invoke()` call patterns

### Phase 4 — E2E & Polish (Week 4+)
12. **E2E setup** with Playwright/WebdriverIO
13. **Critical path E2E tests** (add repo → create worktree → terminal → commit)
14. **CI integration** — run tests on every PR

---

## 6. File Structure

```
src/
├── test/
│   ├── setup.ts                          # Global test setup + Tauri mocks
│   ├── helpers/
│   │   ├── store-helpers.ts              # Store test utilities (reset, seed)
│   │   └── tauri-mocks.ts               # Reusable Tauri invoke mocks
│   └── integration/
│       └── tauri-commands.test.ts
├── store/
│   └── __tests__/
│       └── store.test.ts
├── hooks/
│   └── __tests__/
│       ├── usePRStatus.test.ts
│       ├── useGitWatcher.test.ts
│       ├── useCodeReview.test.ts
│       ├── useProcessStatus.test.ts
│       ├── useDiffStats.test.ts
│       └── useUpdater.test.ts
├── lib/
│   └── __tests__/
│       ├── diff-highlighter.test.ts
│       └── animations.test.ts
├── utils/
│   └── __tests__/
│       └── cn.test.ts
├── types/
│   └── __tests__/
│       └── types.test.ts
├── components/
│   └── __tests__/
│       ├── Sidebar.test.tsx
│       ├── WorktreeItem.test.tsx
│       ├── Navbar.test.tsx
│       ├── PRStatusBadge.test.tsx
│       ├── CommandMenu.test.tsx
│       ├── SettingsPanel.test.tsx
│       ├── TerminalGrid.test.tsx
│       ├── DiffOverlay.test.tsx
│       └── RightPanel/
│           ├── GitTab.test.tsx
│           ├── CommentsTab.test.tsx
│           └── ChecksTab.test.tsx

src-tauri/src/commands/
├── git.rs          # Add #[cfg(test)] mod tests { ... }
├── github.rs       # Add #[cfg(test)] mod tests { ... }
├── process.rs      # Add #[cfg(test)] mod tests { ... }
├── cli_tools.rs    # Add #[cfg(test)] mod tests { ... }
├── terminal.rs     # (complex PTY — test via E2E)
└── watcher.rs      # (event-based — test via integration)
```

---

## 7. Coverage Goals

| Layer | Target | Notes |
|-------|--------|-------|
| Zustand store | **90%+** | Pure logic, easy to test, highest value |
| Rust commands (git, github) | **80%+** | Core business logic |
| Hooks | **75%+** | Mock invoke, test state transitions |
| Utilities/lib | **90%+** | Pure functions |
| Components | **60%+** | Focus on behavior, not styling |
| E2E | **Critical paths** | 5-10 key user journeys |

---

## 8. CI Pipeline

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run test:run
      - run: bun run test:coverage

  rust-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cd src-tauri && cargo test
```

---

## 9. Key Mocking Strategies

### Tauri `invoke()` Mock
```ts
import { invoke } from '@tauri-apps/api/core';
import { vi } from 'vitest';

// Per-test mock
vi.mocked(invoke).mockImplementation(async (cmd, args) => {
  switch (cmd) {
    case 'discover_repository':
      return { path: args.path, name: 'my-repo' };
    case 'list_worktrees':
      return [{ name: 'main', path: '/repo', branch: 'main', last_modified: null }];
    case 'spawn_terminal':
      return 'terminal-uuid-123';
    default:
      throw new Error(`Unmocked command: ${cmd}`);
  }
});
```

### Rust Git Test Helper
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use git2::Repository;

    fn setup_test_repo() -> (TempDir, Repository) {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        // Create initial commit so HEAD exists
        let sig = repo.signature().unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();
        (dir, repo)
    }
}
```

---

## 10. Snapshot/Regression Testing

For detecting unintended behavior changes:

- **Store snapshots**: Serialize store state after key operations, compare against saved snapshots
- **PR status mapping snapshots**: Given known GitHub API responses, snapshot the parsed result
- **Component snapshots**: Optional, use sparingly for complex rendering (diff views)
- **Rust output snapshots**: Use `insta` crate for snapshot testing of git command outputs

```toml
# src-tauri/Cargo.toml (dev-dependencies)
[dev-dependencies]
tempfile = "3"
insta = "1"
```

---

## Summary

This plan provides **~120+ test cases** across 4 layers, prioritizing:
1. **Store logic** (heart of the app, pure state management)
2. **Rust git/github commands** (core business logic)
3. **Hooks** (connect store to UI)
4. **Components** (user-facing behavior)
5. **E2E** (critical user journeys)

Start with Phase 1 for maximum ROI — the Zustand store and Rust parsing functions are pure logic that's easy to test and catches the most regressions.
