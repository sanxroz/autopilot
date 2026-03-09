# PR Review Submission Refactor Plan

## Goal

Refactor PR review submission so one user action in the UI creates **one bundled GitHub review** containing:

- review event: `COMMENT` / `APPROVE` / `REQUEST_CHANGES`
- optional top-level body
- all pending inline comments

Instead of today’s split flow:

- `create_pr_review_comment` called N times
- then `approve_pr` / `request_changes_pr` / `comment_on_pr` separately

## Current Problem

Right now `handleSubmitReview` in `src/components/PRDetailView.tsx`:

1. posts inline comments individually via `create_pr_review_comment`
2. then submits the top-level review separately

That produces disconnected timeline events on GitHub and doesn’t match the UI’s “submit one review” mental model.

---

## Proposed Design

### Keep Two Distinct Paths

#### 1. Immediate inline comment
Keep `create_pr_review_comment` for:

- “add inline comment now” from `PRDiffPanel`
- fast one-off review comments outside the bundled review flow

#### 2. Bundled review submission
Add a new backend command for:

- submit one review with event + body + inline comments in one API call

This keeps current capabilities while fixing the review workflow.

---

## New Backend API

### Add a new Tauri command
In `src-tauri/src/commands/github.rs`:

- `submit_pr_review(...)`

### Suggested request shape

```ts
type SubmitPRReviewPayload = {
  repoPath: string;
  prNumber: number;
  event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
  body?: string;
  comments: Array<{
    path: string;
    line: number;
    body: string;
    side?: 'RIGHT';
  }>;
};
```

### Suggested Rust structs

```rust
#[derive(Debug, Deserialize)]
pub struct SubmitReviewCommentInput {
    pub path: String,
    pub line: u32,
    pub body: String,
    pub side: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitPRReviewInput {
    pub repo_path: String,
    pub pr_number: u64,
    pub event: String,
    pub body: Option<String>,
    pub comments: Vec<SubmitReviewCommentInput>,
}
```

---

## GitHub API Strategy

### Use one REST call
Use GitHub’s review submission endpoint:

`POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`

Payload:

```json
{
  "event": "APPROVE",
  "body": "Looks good",
  "comments": [
    {
      "path": "src/App.tsx",
      "line": 53,
      "side": "RIGHT",
      "body": "Nice change"
    }
  ]
}
```

### Why this approach

It matches exactly what we want:

- one review
- one event
- many inline comments

### Implementation note

Because nested arrays are awkward with `gh api -f/-F`, avoid field flags and instead:

- build a JSON payload in Rust
- write it to a temp file or pass via stdin
- call:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/reviews --method POST --input <payload.json>
```

That should be simpler and less fragile than trying to encode `comments[0][path]` style parameters.

---

## Frontend Changes

### In `src/components/PRDetailView.tsx`

Replace `handleSubmitReview` with:

1. map UI review type to GitHub event
   - `comment` → `COMMENT`
   - `approve` → `APPROVE`
   - `request_changes` → `REQUEST_CHANGES`
2. call one backend command:
   - `submit_pr_review`
3. if successful:
   - clear submitted pending comments
   - refresh PR details
   - show one success toast

### Validation rules

Keep these in frontend before calling backend:

- `comment` requires body or comments
- `approve` can be empty, but comments/body are allowed
- `request_changes` should be allowed if there is a body or inline comments

### Recommended normalization

Before sending:

- trim body
- trim each comment body
- drop empty comments

---

## UX Behavior After Refactor

### Desired outcomes

- Submit review from sidebar creates one GitHub review event
- Inline comments appear attached to that review
- Pending inline comments disappear only after success
- If submission fails, nothing is cleared

### Toasts

Use action-specific success copy:

- `Review submitted`
- `Review approved`
- `Changes requested`

---

## Backend Refactor Steps

### Phase 1: extract shared helpers
Refactor existing GitHub helpers to reduce duplication:

- helper to resolve `owner/repo`
- helper to fetch latest PR commit SHA if still needed elsewhere
- helper to run `gh api`

### Phase 2: add `submit_pr_review`
Implement:

- payload building
- one API call
- clean error handling
- return `Result<bool, String>` initially

### Phase 3: register command
In `src-tauri/src/lib.rs`:

- add `github::submit_pr_review`
- keep old commands for now

---

## What to do with existing commands

### Keep

- `create_pr_review_comment`
- `approve_pr`
- `request_changes_pr`
- `comment_on_pr`

### Why keep them

They may still be useful for:

- immediate inline comments
- board-level quick actions
- future isolated workflows

### But

`handleSubmitReview` should stop using:

- `approve_pr`
- `request_changes_pr`
- `comment_on_pr`
- `create_pr_review_comment`

for bundled submissions.

---

## Edge Cases to Cover

### 1. Approve with only inline comments
Should produce one `APPROVE` review with comments.

### 2. Comment with no body but with inline comments
Should produce one `COMMENT` review.

### 3. Request changes with inline comments only
Should be allowed.

### 4. No body and no comments
Frontend should short-circuit and not call backend.

### 5. Invalid line/path
Backend should return a clean error from GitHub.

### 6. Mixed success impossible
One API call means fewer partial-success states, which is a major benefit.

---

## Testing Plan

### Manual test matrix

#### Comment review
- body only
- inline comments only
- body + inline comments

#### Approve review
- no body, no comments
- body only
- inline comments only
- body + comments

#### Request changes
- body only
- inline comments only
- body + comments

### Verify on GitHub
For each case:

- only one review event appears
- inline comments are grouped under that review
- review state is correct

---

## Optional Follow-up Improvements

### 1. Stronger return type
Instead of `Result<bool, String>`, return:

```rust
pub struct SubmitPRReviewResult {
    pub submitted: bool,
    pub review_id: Option<String>,
}
```

### 2. Better error messages
Convert raw GH API errors into user-friendly messages.

### 3. Support left/right side later
For now, default `side = RIGHT` to match existing behavior.

---

## Recommended Implementation Order

1. add Rust input structs
2. implement `submit_pr_review`
3. register command in `src-tauri/src/lib.rs`
4. update `handleSubmitReview` in `src/components/PRDetailView.tsx`
5. keep `create_pr_review_comment` only for immediate inline comments
6. test against GitHub manually

---

## Summary

The cleanest fix is:

- **new command**: `submit_pr_review`
- **one GitHub API call** to `/pulls/{pull_number}/reviews`
- **frontend submits event + body + pending comments together**
- **keep existing single-comment command** for immediate inline commenting
