use super::cli_tools::find_cli_tool;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRStatus {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub merged: bool,
    pub draft: bool,
    pub review_decision: Option<String>,
    pub checks_status: Option<String>,
    pub mergeable: Option<String>,
    pub additions: u64,
    pub deletions: u64,
    pub head_branch: String,
    pub base_branch: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub labels: Vec<String>,
    pub requested_reviewers: Vec<String>,
    pub has_unresolved_review_threads: bool,
    pub is_bot: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhStatusCheck {
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhLabel {
    name: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct GhCommitSummary {
    oid: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubIssue {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub repo_name: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub labels: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubNotification {
    pub id: String,
    pub reason: String,
    pub repo_name: String,
    pub subject_title: String,
    pub subject_type: String,
    pub subject_url: Option<String>,
    pub unread: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GhSearchIssue {
    number: u64,
    title: String,
    url: String,
    state: String,
    repository: GhSearchRepo,
    author: GhUser,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(default)]
    labels: Vec<GhLabel>,
}

#[derive(Debug, Deserialize)]
struct GhSearchRepo {
    #[serde(rename = "nameWithOwner")]
    name_with_owner: String,
}

#[derive(Debug, Deserialize)]
struct GhApiNotification {
    id: String,
    reason: String,
    repository: GhApiNotificationRepo,
    subject: GhApiNotificationSubject,
    unread: bool,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GhApiNotificationRepo {
    full_name: String,
}

#[derive(Debug, Deserialize)]
struct GhApiNotificationSubject {
    title: String,
    #[serde(rename = "type")]
    type_: String,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPRResponse {
    number: u64,
    title: String,
    url: String,
    state: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    merged_at: Option<String>,
    #[serde(default)]
    mergeable: Option<String>,
    #[serde(default)]
    review_decision: Option<String>,
    #[serde(default)]
    status_check_rollup: Vec<GhStatusCheck>,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
    head_ref_name: String,
    #[serde(default)]
    base_ref_name: String,
    #[serde(default)]
    author: Option<GhUser>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    labels: Vec<GhLabel>,
    #[serde(default)]
    review_requests: Vec<serde_json::Value>,
    #[serde(default)]
    commits: Vec<GhCommitSummary>,
}

fn compute_checks_status(checks: &[GhStatusCheck]) -> Option<String> {
    if checks.is_empty() {
        return None;
    }

    let has_failure = checks.iter().any(|c| {
        c.conclusion.as_deref() == Some("FAILURE")
            || c.conclusion.as_deref() == Some("ERROR")
            || c.state.as_deref() == Some("FAILURE")
            || c.state.as_deref() == Some("ERROR")
    });

    let has_pending = checks
        .iter()
        .any(|c| c.conclusion.is_none() && c.state.as_deref() == Some("PENDING"));

    if has_failure {
        Some("failure".to_string())
    } else if has_pending {
        Some("pending".to_string())
    } else {
        Some("success".to_string())
    }
}

fn is_bot_author(author: &str, head_branch: &str) -> bool {
    let author_lc = author.to_lowercase();
    let branch_lc = head_branch.to_lowercase();

    author_lc.ends_with("[bot]")
        || author_lc.ends_with("-bot")
        || author_lc.ends_with("_bot")
        || author_lc == "opencode"
        || author_lc == "claude"
        || author_lc == "codex"
        || author_lc == "amp"
        || author_lc == "droid"
        || author_lc == "pi"
        || branch_lc.starts_with("opencode/")
        || branch_lc.starts_with("claude/")
        || branch_lc.starts_with("codex/")
        || branch_lc.starts_with("amp/")
        || branch_lc.starts_with("droid/")
        || branch_lc.starts_with("pi/")
}

fn map_gh_pr_to_status(pr: GhPRResponse) -> PRStatus {
    let author = pr
        .author
        .map(|a| a.login)
        .unwrap_or_else(|| "unknown".to_string());
    let created_at = pr.created_at.unwrap_or_default();
    let updated_at = pr.updated_at.unwrap_or_default();
    let labels = pr.labels.into_iter().map(|l| l.name).collect::<Vec<_>>();
    let requested_reviewers = pr
        .review_requests
        .into_iter()
        .filter_map(|request| {
            request
                .get("login")
                .and_then(|v| v.as_str())
                .map(ToString::to_string)
                .or_else(|| {
                    request
                        .get("requestedReviewer")
                        .and_then(|v| v.get("login"))
                        .and_then(|v| v.as_str())
                        .map(ToString::to_string)
                })
        })
        .collect::<Vec<_>>();

    PRStatus {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: pr.state.to_lowercase(),
        merged: pr.merged_at.is_some(),
        draft: pr.is_draft,
        review_decision: pr.review_decision.filter(|s| !s.is_empty()),
        checks_status: compute_checks_status(&pr.status_check_rollup),
        mergeable: pr
            .mergeable
            .map(|s| s.to_uppercase())
            .filter(|s| !s.is_empty()),
        additions: pr.additions,
        deletions: pr.deletions,
        head_branch: pr.head_ref_name.clone(),
        base_branch: pr.base_ref_name.clone(),
        author: author.clone(),
        created_at,
        updated_at,
        labels,
        requested_reviewers,
        has_unresolved_review_threads: false,
        is_bot: is_bot_author(&author, &pr.head_ref_name),
    }
}

#[tauri::command]
pub fn check_gh_cli() -> Result<bool, String> {
    let gh_path = match find_cli_tool("gh") {
        Ok(path) => path,
        Err(_) => return Ok(false),
    };
    match Command::new(&gh_path).arg("--version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn check_gh_auth() -> Result<String, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args(["auth", "status"])
        .output()
        .map_err(|e| format!("Failed to run gh auth status: {}", e))?;

    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    if combined.contains("Logged in to") {
        for line in combined.lines() {
            if line.contains("account") {
                if let Some(start) = line.find("account ") {
                    let rest = &line[start + 8..];
                    if let Some(end) = rest.find(' ') {
                        return Ok(rest[..end].to_string());
                    }
                    return Ok(rest.trim().to_string());
                }
            }
        }
        Ok("authenticated".to_string())
    } else {
        Err("Not logged in to GitHub".to_string())
    }
}

const PR_JSON_FIELDS: &str = "number,title,url,state,isDraft,mergedAt,mergeable,reviewDecision,statusCheckRollup,additions,deletions,headRefName,baseRefName,author,createdAt,updatedAt,labels,reviewRequests";

#[tauri::command]
pub async fn get_pr_for_branch(
    repo_path: String,
    branch: String,
) -> Result<Option<PRStatus>, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args([
            "pr",
            "list",
            "--head",
            &branch,
            "--state",
            "all",
            "--limit",
            "1",
            "--json",
            PR_JSON_FIELDS,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let prs: Vec<GhPRResponse> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(prs.into_iter().next().map(map_gh_pr_to_status))
}

#[derive(Debug, Deserialize)]
pub struct WorktreePRLookup {
    pub worktree_path: String,
    pub branch: String,
    pub head_oid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RepoWithWorktrees {
    pub repo_path: String,
    pub worktrees: Vec<WorktreePRLookup>,
}

#[derive(Debug, Deserialize)]
pub struct RepoPathInput {
    pub repo_path: String,
}

#[derive(Debug, Serialize)]
pub struct RepoPRStatuses {
    pub repo_path: String,
    pub statuses: Vec<PRStatus>,
    pub worktree_statuses: Vec<WorktreePRStatus>,
    pub checked_worktrees: Vec<String>,
    pub failed_worktrees: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct WorktreePRStatus {
    pub worktree_path: String,
    pub branch: String,
    pub status: Option<PRStatus>,
}

#[derive(Clone)]
struct PRStatusCandidate {
    status: PRStatus,
    head_oid: Option<String>,
}

fn parse_github_owner_repo(repo_path: &str) -> Option<(String, String)> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(repo_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let url = String::from_utf8(output.stdout).ok()?.trim().to_string();

    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    let path_part = if let Some(idx) = url.find("github.com:") {
        &url[idx + 11..]
    } else if let Some(idx) = url.find("github.com/") {
        &url[idx + 11..]
    } else {
        return None;
    };

    let path_part = path_part.trim_end_matches(".git").trim_end_matches('/');
    let parts: Vec<&str> = path_part.splitn(3, '/').collect();
    if parts.len() >= 2 {
        Some((parts[0].to_string(), parts[1].to_string()))
    } else {
        None
    }
}

fn parse_graphql_pr_node(node: &serde_json::Value) -> Option<PRStatusCandidate> {
    let number = node["number"].as_u64()?;
    let title = node["title"].as_str()?.to_string();
    let url = node["url"].as_str()?.to_string();
    let state = node["state"].as_str()?.to_lowercase();
    let is_draft = node["isDraft"].as_bool().unwrap_or(false);
    let merged_at = node["mergedAt"].as_str();
    let review_decision = node["reviewDecision"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mergeable = node["mergeable"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_uppercase());
    let additions = node["additions"].as_u64().unwrap_or(0);
    let deletions = node["deletions"].as_u64().unwrap_or(0);
    let head_ref_name = node["headRefName"].as_str()?.to_string();
    let base_ref_name = node["baseRefName"].as_str().unwrap_or("").to_string();
    let author = node["author"]["login"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let created_at = node["createdAt"].as_str().unwrap_or_default().to_string();
    let updated_at = node["updatedAt"].as_str().unwrap_or_default().to_string();
    let labels = node["labels"]["nodes"]
        .as_array()
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|label| label["name"].as_str().map(ToString::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let requested_reviewers = node["reviewRequests"]["nodes"]
        .as_array()
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|request| {
                    request["requestedReviewer"]["login"]
                        .as_str()
                        .map(ToString::to_string)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let has_unresolved_review_threads = review_threads_have_unresolved(&node["reviewThreads"]);
    let head_oid = node["headRefOid"].as_str().map(ToString::to_string);

    // Parse checks from commits -> nodes[0] -> commit -> statusCheckRollup -> contexts -> nodes
    let checks: Vec<GhStatusCheck> = node["commits"]["nodes"]
        .as_array()
        .and_then(|nodes| nodes.first())
        .and_then(|n| n["commit"]["statusCheckRollup"]["contexts"]["nodes"].as_array())
        .map(|contexts| {
            contexts
                .iter()
                .filter_map(|ctx| {
                    let typename = ctx["__typename"].as_str()?;
                    match typename {
                        "CheckRun" => Some(GhStatusCheck {
                            conclusion: ctx["conclusion"].as_str().map(|s| s.to_string()),
                            state: if ctx["conclusion"].is_null()
                                || ctx["conclusion"].as_str().is_none()
                            {
                                Some("PENDING".to_string())
                            } else {
                                None
                            },
                        }),
                        "StatusContext" => Some(GhStatusCheck {
                            conclusion: None,
                            state: ctx["state"].as_str().map(|s| s.to_string()),
                        }),
                        _ => None,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Some(PRStatusCandidate {
        status: PRStatus {
            number,
            title,
            url,
            state,
            merged: merged_at.is_some(),
            draft: is_draft,
            review_decision,
            checks_status: compute_checks_status(&checks),
            mergeable,
            additions,
            deletions,
            head_branch: head_ref_name.clone(),
            base_branch: base_ref_name.clone(),
            author: author.clone(),
            created_at,
            updated_at,
            labels,
            requested_reviewers,
            has_unresolved_review_threads,
            is_bot: is_bot_author(&author, &head_ref_name),
        },
        head_oid,
    })
}

fn review_threads_have_unresolved(review_threads: &serde_json::Value) -> bool {
    review_threads["nodes"].as_array().is_some_and(|threads| {
        threads
            .iter()
            .any(|thread| thread["isResolved"].as_bool() == Some(false))
    })
}

fn review_threads_next_cursor(review_threads: &serde_json::Value) -> Option<String> {
    review_threads["pageInfo"]["hasNextPage"]
        .as_bool()
        .filter(|has_next_page| *has_next_page)
        .and_then(|_| review_threads["pageInfo"]["endCursor"].as_str())
        .map(ToString::to_string)
}

fn fetch_unresolved_review_threads_after(
    gh_path: &str,
    repo_path: &str,
    owner: &str,
    name: &str,
    pr_number: u64,
    mut cursor: String,
) -> Option<bool> {
    loop {
        let owner = serde_json::to_string(owner).ok()?;
        let name = serde_json::to_string(name).ok()?;
        let cursor_json = serde_json::to_string(&cursor).ok()?;
        let query = format!(
            "query {{ repository(owner: {owner}, name: {name}) {{ pullRequest(number: {pr_number}) {{ reviewThreads(first: 100, after: {cursor_json}) {{ nodes {{ isResolved }} pageInfo {{ hasNextPage endCursor }} }} }} }} }}"
        );
        let output = Command::new(gh_path)
            .args(["api", "graphql", "-f", &format!("query={query}")])
            .current_dir(repo_path)
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let response: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
        if response
            .get("errors")
            .is_some_and(|errors| !errors.is_null())
        {
            return None;
        }

        let review_threads = &response["data"]["repository"]["pullRequest"]["reviewThreads"];
        if review_threads_have_unresolved(review_threads) {
            return Some(true);
        }

        match review_threads_next_cursor(review_threads) {
            Some(next_cursor) => cursor = next_cursor,
            None => return Some(false),
        }
    }
}

fn unique_branches(worktrees: &[WorktreePRLookup]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut branches = Vec::new();

    for worktree in worktrees {
        if seen.insert(worktree.branch.clone()) {
            branches.push(worktree.branch.clone());
        }
    }

    branches
}

fn resolve_candidate_for_worktree(
    worktree: &WorktreePRLookup,
    candidates: &[PRStatusCandidate],
) -> Option<PRStatus> {
    if let Some(head_oid) = worktree.head_oid.as_deref() {
        if let Some(candidate) = candidates
            .iter()
            .find(|candidate| candidate.head_oid.as_deref() == Some(head_oid))
        {
            return Some(candidate.status.clone());
        }
    }

    let mut open_candidates = candidates
        .iter()
        .filter(|candidate| candidate.status.state == "open");
    let first_open = open_candidates.next()?;

    if open_candidates.next().is_some() {
        return None;
    }

    Some(first_open.status.clone())
}

fn build_branch_fetch_result(
    repo_path: String,
    worktrees: &[WorktreePRLookup],
    branch_candidates: HashMap<String, Vec<PRStatusCandidate>>,
    failed_branches: HashSet<String>,
) -> RepoPRStatuses {
    let mut statuses = Vec::new();
    let mut seen_pr_numbers = HashSet::new();
    let mut worktree_statuses = Vec::with_capacity(worktrees.len());
    let mut checked_worktrees = Vec::new();
    let mut failed_worktrees = Vec::new();

    for worktree in worktrees {
        if failed_branches.contains(&worktree.branch) {
            failed_worktrees.push(worktree.worktree_path.clone());
            continue;
        }

        checked_worktrees.push(worktree.worktree_path.clone());
        let resolved = branch_candidates
            .get(&worktree.branch)
            .and_then(|candidates| resolve_candidate_for_worktree(worktree, candidates));

        if let Some(status) = resolved.as_ref() {
            if seen_pr_numbers.insert(status.number) {
                statuses.push(status.clone());
            }
        }

        worktree_statuses.push(WorktreePRStatus {
            worktree_path: worktree.worktree_path.clone(),
            branch: worktree.branch.clone(),
            status: resolved,
        });
    }

    RepoPRStatuses {
        repo_path,
        statuses,
        worktree_statuses,
        checked_worktrees,
        failed_worktrees,
    }
}

fn fetch_all_prs_for_repo(gh_path: &str, repo: RepoWithWorktrees) -> RepoPRStatuses {
    if repo.worktrees.is_empty() {
        return RepoPRStatuses {
            repo_path: repo.repo_path,
            statuses: Vec::new(),
            worktree_statuses: Vec::new(),
            checked_worktrees: Vec::new(),
            failed_worktrees: Vec::new(),
        };
    }

    let branches = unique_branches(&repo.worktrees);

    if let Some((owner, name)) = parse_github_owner_repo(&repo.repo_path) {
        if let Some(result) = fetch_prs_graphql(
            gh_path,
            &repo.repo_path,
            &owner,
            &name,
            &repo.worktrees,
            &branches,
        ) {
            return result;
        }
    }

    fetch_prs_rest_fallback(gh_path, &repo.repo_path, &repo.worktrees, &branches)
}

fn fetch_prs_graphql(
    gh_path: &str,
    repo_path: &str,
    owner: &str,
    name: &str,
    worktrees: &[WorktreePRLookup],
    branches: &[String],
) -> Option<RepoPRStatuses> {
    let mut branch_candidates: HashMap<String, Vec<PRStatusCandidate>> = HashMap::new();
    let mut failed_branches = HashSet::new();

    for chunk in branches.chunks(25) {
        let branch_fragments: Vec<String> = chunk
            .iter()
            .enumerate()
            .map(|(i, branch)| {
                let json_escaped = serde_json::to_string(branch.as_str())
                    .unwrap_or_else(|_| format!("\"{}\"", branch));
                let escaped = &json_escaped[1..json_escaped.len() - 1];
                format!(
                    r#"b{i}: pullRequests(headRefName: "{escaped}", first: 20, states: [OPEN, CLOSED, MERGED], orderBy: {{field: UPDATED_AT, direction: DESC}}) {{
                        nodes {{
                            number title url state isDraft mergedAt mergeable reviewDecision additions deletions headRefName headRefOid baseRefName
                            author {{ login }}
                            createdAt
                            updatedAt
                            labels(first: 10) {{ nodes {{ name }} }}
                            reviewRequests(first: 10) {{
                                nodes {{
                                    requestedReviewer {{
                                        ... on User {{ login }}
                                    }}
                                }}
                            }}
                            reviewThreads(first: 100) {{
                                nodes {{ isResolved }}
                                pageInfo {{ hasNextPage endCursor }}
                            }}
                            commits(last: 1) {{
                                nodes {{
                                    commit {{
                                        statusCheckRollup {{
                                            contexts(first: 50) {{
                                                nodes {{
                                                    __typename
                                                    ... on CheckRun {{ conclusion status }}
                                                    ... on StatusContext {{ state }}
                                                }}
                                            }}
                                        }}
                                    }}
                                }}
                            }}
                        }}
                    }}"#
                )
            })
            .collect();

        let owner_escaped = owner.replace('"', "\\\"");
        let name_escaped = name.replace('"', "\\\"");
        let query = format!(
            r#"query {{ repository(owner: "{owner_escaped}", name: "{name_escaped}") {{ {fragments} }} }}"#,
            fragments = branch_fragments.join("\n")
        );

        let output = Command::new(gh_path)
            .args(["api", "graphql", "-f", &format!("query={}", query)])
            .current_dir(repo_path)
            .output()
            .ok()?;

        if !output.status.success() {
            eprintln!(
                "GraphQL query failed for {}/{}: {}",
                owner,
                name,
                String::from_utf8_lossy(&output.stderr)
            );
            return None; // Fall back to REST
        }

        let stdout = String::from_utf8(output.stdout).ok()?;
        let response: serde_json::Value = serde_json::from_str(&stdout).ok()?;

        if response.get("errors").is_some() && !response["errors"].is_null() {
            eprintln!(
                "GraphQL returned errors for {}/{}: {}",
                owner, name, response["errors"]
            );
            return None;
        }

        let repo_data = &response["data"]["repository"];
        if repo_data.is_null() {
            eprintln!("GraphQL returned null repository for {}/{}", owner, name);
            return None;
        }

        for (i, branch) in chunk.iter().enumerate() {
            let alias = format!("b{}", i);
            let branch = branch.clone();

            if let Some(nodes) = repo_data[&alias]["nodes"].as_array() {
                let mut parsed = Vec::new();
                for node in nodes {
                    let Some(mut candidate) = parse_graphql_pr_node(node) else {
                        continue;
                    };

                    if !candidate.status.has_unresolved_review_threads {
                        if let Some(cursor) = review_threads_next_cursor(&node["reviewThreads"]) {
                            candidate.status.has_unresolved_review_threads =
                                fetch_unresolved_review_threads_after(
                                    gh_path,
                                    repo_path,
                                    owner,
                                    name,
                                    candidate.status.number,
                                    cursor,
                                )?;
                        }
                    }

                    parsed.push(candidate);
                }

                if parsed.is_empty() && !nodes.is_empty() {
                    eprintln!(
                        "Failed to parse GraphQL PR nodes for branch {} in {}",
                        branch, repo_path
                    );
                    failed_branches.insert(branch);
                    continue;
                }

                branch_candidates.insert(branch, parsed);
            } else {
                eprintln!(
                    "GraphQL response missing nodes for branch {} in {}",
                    branch, repo_path
                );
                failed_branches.insert(branch);
            }
        }
    }

    Some(build_branch_fetch_result(
        repo_path.to_string(),
        worktrees,
        branch_candidates,
        failed_branches,
    ))
}

fn fetch_prs_rest_fallback(
    gh_path: &str,
    repo_path: &str,
    worktrees: &[WorktreePRLookup],
    branches: &[String],
) -> RepoPRStatuses {
    let mut branch_candidates: HashMap<String, Vec<PRStatusCandidate>> = HashMap::new();
    let mut failed_branches = HashSet::new();

    for branch in branches {
        let output = Command::new(gh_path)
            .args([
                "pr",
                "list",
                "--head",
                branch,
                "--state",
                "all",
                "--limit",
                "20",
                "--json",
                &format!("{},commits", PR_JSON_FIELDS),
            ])
            .current_dir(repo_path)
            .output();

        match output {
            Ok(out) if out.status.success() => match String::from_utf8(out.stdout) {
                Ok(stdout) => match serde_json::from_str::<Vec<GhPRResponse>>(&stdout) {
                    Ok(prs) => {
                        let candidates = prs
                            .into_iter()
                            .map(|pr| {
                                let head_oid = pr.commits.last().map(|commit| commit.oid.clone());
                                PRStatusCandidate {
                                    status: map_gh_pr_to_status(pr),
                                    head_oid,
                                }
                            })
                            .collect::<Vec<_>>();
                        branch_candidates.insert(branch.clone(), candidates);
                    }
                    Err(error) => {
                        failed_branches.insert(branch.clone());
                        eprintln!(
                            "Failed to parse PR list JSON for branch {} in {}: {}",
                            branch, repo_path, error
                        );
                    }
                },
                Err(error) => {
                    failed_branches.insert(branch.clone());
                    eprintln!(
                        "Invalid UTF-8 from gh pr list for branch {} in {}: {}",
                        branch, repo_path, error
                    );
                }
            },
            Ok(out) => {
                failed_branches.insert(branch.clone());
                eprintln!(
                    "gh pr list failed for branch {} in {}: {}",
                    branch,
                    repo_path,
                    String::from_utf8_lossy(&out.stderr)
                );
            }
            Err(error) => {
                failed_branches.insert(branch.clone());
                eprintln!(
                    "Failed to execute gh pr list for branch {} in {}: {}",
                    branch, repo_path, error
                );
            }
        }
    }

    build_branch_fetch_result(
        repo_path.to_string(),
        worktrees,
        branch_candidates,
        failed_branches,
    )
}

#[tauri::command]
pub async fn get_all_prs_for_repos(
    repos: Vec<RepoWithWorktrees>,
) -> Result<Vec<RepoPRStatuses>, String> {
    let gh_path = find_cli_tool("gh")?;

    const MAX_CONCURRENT_REPO_FETCHES: usize = 4;

    let mut results = Vec::new();
    let mut handles = Vec::new();

    for repo in repos {
        let gh = gh_path.clone();
        handles.push(std::thread::spawn(move || {
            fetch_all_prs_for_repo(&gh, repo)
        }));

        if handles.len() >= MAX_CONCURRENT_REPO_FETCHES {
            for handle in handles.drain(..) {
                match handle.join() {
                    Ok(result) => results.push(result),
                    Err(error) => {
                        eprintln!("Thread panicked while fetching PR statuses: {:?}", error);
                    }
                }
            }
        }
    }

    for handle in handles {
        match handle.join() {
            Ok(result) => results.push(result),
            Err(error) => {
                eprintln!("Thread panicked while fetching PR statuses: {:?}", error);
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_all_open_prs_for_repos(
    repos: Vec<RepoPathInput>,
) -> Result<Vec<RepoPRStatuses>, String> {
    let gh_path = find_cli_tool("gh")?;
    let mut results = Vec::new();

    for repo in repos {
        let output = Command::new(&gh_path)
            .args([
                "pr",
                "list",
                "--state",
                "open",
                "--limit",
                "100",
                "--json",
                PR_JSON_FIELDS,
            ])
            .current_dir(&repo.repo_path)
            .output();

        let statuses = match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8(out.stdout).unwrap_or_default();
                let prs: Vec<GhPRResponse> = serde_json::from_str(&stdout).unwrap_or_default();
                prs.into_iter().map(map_gh_pr_to_status).collect()
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                eprintln!(
                    "DEBUG: Failed to fetch open PRs for {}: {}",
                    repo.repo_path, stderr
                );
                Vec::new()
            }
            Err(e) => {
                eprintln!(
                    "DEBUG: Failed to run gh command for {}: {}",
                    repo.repo_path, e
                );
                Vec::new()
            }
        };

        results.push(RepoPRStatuses {
            repo_path: repo.repo_path,
            statuses,
            worktree_statuses: Vec::new(),
            checked_worktrees: Vec::new(),
            failed_worktrees: Vec::new(),
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_pr_status(repo_path: String, pr_number: u64) -> Result<PRStatus, String> {
    let gh_path = find_cli_tool("gh")?;
    let pr_ref = format!("{}", pr_number);

    let output = Command::new(&gh_path)
        .args(["pr", "view", &pr_ref, "--json", PR_JSON_FIELDS])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let pr: GhPRResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(map_gh_pr_to_status(pr))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitReviewCommentInput {
    pub path: String,
    pub line: u32,
    pub body: String,
    pub side: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubmitReviewCommentPayload {
    path: String,
    line: u32,
    body: String,
    side: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubmitPRReviewPayload {
    event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    comments: Vec<SubmitReviewCommentPayload>,
}

async fn resolve_repo_name_with_owner(repo_path: &str) -> Result<String, String> {
    get_repo_from_remote(repo_path.to_string())
        .await?
        .ok_or_else(|| "Failed to resolve repository owner/name".to_string())
}

fn get_latest_pr_commit_sha(
    gh_path: &str,
    repo_path: &str,
    pr_number: u64,
) -> Result<String, String> {
    let latest_commit_output = Command::new(gh_path)
        .args([
            "pr",
            "view",
            &pr_number.to_string(),
            "--json",
            "commits",
            "-q",
            ".commits[-1].oid",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get latest PR commit SHA: {}", e))?;

    if !latest_commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&latest_commit_output.stderr);
        return Err(format!("Failed to get latest PR commit SHA: {}", stderr));
    }

    let latest_commit_sha = String::from_utf8(latest_commit_output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {}", e))?
        .trim()
        .to_string();

    if latest_commit_sha.is_empty() {
        return Err("Latest PR commit SHA is empty".to_string());
    }

    Ok(latest_commit_sha)
}

fn run_gh_api_json_post<T: Serialize>(
    gh_path: &str,
    repo_path: &str,
    endpoint: &str,
    payload: &T,
) -> Result<(), String> {
    let payload_bytes = serde_json::to_vec(payload)
        .map_err(|e| format!("Failed to serialize GitHub API payload: {}", e))?;

    let payload_path = std::env::temp_dir().join(format!(
        "autopilot-gh-api-payload-{}.json",
        uuid::Uuid::new_v4()
    ));

    fs::write(&payload_path, payload_bytes)
        .map_err(|e| format!("Failed to write GitHub API payload: {}", e))?;

    let output = Command::new(gh_path)
        .args(["api", endpoint, "--method", "POST", "--input"])
        .arg(&payload_path)
        .current_dir(repo_path)
        .output();

    let _ = fs::remove_file(&payload_path);

    let output = output.map_err(|e| format!("Failed to run gh api command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if stderr.is_empty() { stdout } else { stderr };
        Err(if message.is_empty() {
            "GitHub API request failed".to_string()
        } else {
            message
        })
    }
}

#[tauri::command]
pub async fn approve_pr(repo_path: String, pr_number: u64) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args(["pr", "review", &pr_number.to_string(), "--approve"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to approve PR: {}", stderr))
    }
}

#[tauri::command]
pub async fn request_changes_pr(
    repo_path: String,
    pr_number: u64,
    body: String,
) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args([
            "pr",
            "review",
            &pr_number.to_string(),
            "--request-changes",
            "--body",
            &body,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to request changes: {}", stderr))
    }
}

#[tauri::command]
pub async fn comment_on_pr(
    repo_path: String,
    pr_number: u64,
    body: String,
) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args(["pr", "comment", &pr_number.to_string(), "--body", &body])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to comment on PR: {}", stderr))
    }
}

#[tauri::command]
pub async fn create_pr_review_comment(
    repo_path: String,
    pr_number: u64,
    body: String,
    path: String,
    line: u32,
) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let repo_info = resolve_repo_name_with_owner(&repo_path).await?;
    let latest_commit_sha = get_latest_pr_commit_sha(&gh_path, &repo_path, pr_number)?;

    let endpoint = format!("repos/{}/pulls/{}/comments", repo_info, pr_number);
    let payload = serde_json::json!({
        "body": body,
        "path": path,
        "line": line,
        "commit_id": latest_commit_sha,
        "side": "RIGHT",
    });

    run_gh_api_json_post(&gh_path, &repo_path, &endpoint, &payload)
        .map_err(|e| format!("Failed to create PR review comment: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn submit_pr_review(
    repo_path: String,
    pr_number: u64,
    event: String,
    body: Option<String>,
    comments: Vec<SubmitReviewCommentInput>,
) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let repo_info = resolve_repo_name_with_owner(&repo_path).await?;

    let normalized_event = match event.trim().to_uppercase().as_str() {
        "COMMENT" => "COMMENT",
        "APPROVE" => "APPROVE",
        "REQUEST_CHANGES" => "REQUEST_CHANGES",
        _ => return Err(format!("Invalid review event: {}", event)),
    }
    .to_string();

    let normalized_body = body
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let normalized_comments = comments
        .into_iter()
        .filter_map(|comment| {
            let path = comment.path.trim().to_string();
            let body = comment.body.trim().to_string();

            if path.is_empty() || body.is_empty() {
                return None;
            }

            Some(SubmitReviewCommentPayload {
                path,
                line: comment.line,
                body,
                side: comment
                    .side
                    .map(|value| value.trim().to_uppercase())
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "RIGHT".to_string()),
            })
        })
        .collect::<Vec<_>>();

    if matches!(normalized_event.as_str(), "COMMENT" | "REQUEST_CHANGES")
        && normalized_body.is_none()
        && normalized_comments.is_empty()
    {
        return Err("Review submission requires a body or at least one inline comment".to_string());
    }

    let payload = SubmitPRReviewPayload {
        event: normalized_event,
        body: normalized_body,
        comments: normalized_comments,
    };

    let endpoint = format!("repos/{}/pulls/{}/reviews", repo_info, pr_number);
    run_gh_api_json_post(&gh_path, &repo_path, &endpoint, &payload)
        .map_err(|e| format!("Failed to submit PR review: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn close_pr(repo_path: String, pr_number: u64) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args(["pr", "close", &pr_number.to_string()])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to close PR: {}", stderr))
    }
}

#[tauri::command]
pub async fn rerequest_pr_review(
    repo_path: String,
    pr_number: u64,
    reviewer: String,
) -> Result<bool, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args([
            "pr",
            "edit",
            &pr_number.to_string(),
            "--add-reviewer",
            &reviewer,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to re-request reviewer: {}", stderr))
    }
}

#[tauri::command]
pub async fn get_repo_from_remote(repo_path: String) -> Result<Option<String>, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args([
            "repo",
            "view",
            "--json",
            "nameWithOwner",
            "-q",
            ".nameWithOwner",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if output.status.success() {
        let name = String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8: {}", e))?
            .trim()
            .to_string();
        if name.is_empty() {
            Ok(None)
        } else {
            Ok(Some(name))
        }
    } else {
        Ok(None)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
    pub comment_type: String,      // "issue", "review", "review_thread"
    pub state: Option<String>,     // For reviews: "approved", "changes_requested", "commented"
    pub path: Option<String>,      // For review threads: file path
    pub line: Option<u32>,         // For review threads: line number
    pub review_id: Option<String>, // For review threads: parent review ID
    pub is_resolved: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRDetailedInfo {
    pub merge_state_status: String,
    pub mergeable: String,
    pub comments: Vec<PRComment>,
    pub review_decision: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhCommentAuthor {
    login: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhComment {
    author: GhCommentAuthor,
    body: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct GhReview {
    id: String,
    #[serde(default)]
    database_id: Option<u64>,
    author: GhCommentAuthor,
    body: String,
    submitted_at: Option<String>,
    state: String,
}

#[derive(Debug, Deserialize)]
struct RestApiReview {
    id: u64,
    user: GhCommentAuthor,
    body: String,
    submitted_at: Option<String>,
    state: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GhReviewComment {
    user: GhCommentAuthor,
    body: String,
    created_at: String,
    path: String,
    line: Option<u32>,
    original_line: Option<u32>,
    pull_request_review_id: Option<u64>,
    #[serde(default)]
    id: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct GhPRDetailedResponse {
    merge_state_status: String,
    mergeable: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    comments: Vec<GhComment>,
    #[serde(default)]
    reviews: Vec<GhReview>,
    #[serde(default)]
    review_decision: Option<String>,
}

async fn fetch_reviews_rest_api(
    repo_path: &str,
    pr_number: u64,
) -> Result<Vec<RestApiReview>, String> {
    let gh_path = find_cli_tool("gh")?;
    eprintln!("DEBUG: Fetching reviews via REST API for PR #{}", pr_number);
    let output = Command::new(&gh_path)
        .args([
            "api",
            &format!("repos/{{owner}}/{{repo}}/pulls/{}/reviews", pr_number),
            "--paginate",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to fetch reviews: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("DEBUG: gh api reviews failed: {}", stderr);
        return Ok(Vec::new());
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    match serde_json::from_str::<Vec<RestApiReview>>(&stdout) {
        Ok(reviews) => {
            eprintln!(
                "DEBUG: Successfully parsed {} reviews from REST API",
                reviews.len()
            );
            Ok(reviews)
        }
        Err(e) => {
            eprintln!("DEBUG: Failed to parse reviews: {}", e);
            Ok(Vec::new())
        }
    }
}

async fn fetch_review_comments_rest_api(
    repo_path: &str,
    pr_number: u64,
) -> Result<Vec<GhReviewComment>, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args([
            "api",
            &format!("repos/{{owner}}/{{repo}}/pulls/{}/comments", pr_number),
            "--paginate",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to fetch review comments: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch review comments: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    serde_json::from_str::<Vec<GhReviewComment>>(&stdout)
        .map_err(|e| format!("Failed to parse review comments: {}", e))
}

#[derive(Debug, Deserialize)]
struct GraphqlThreadResponse {
    data: GraphqlRepositoryData,
}

#[derive(Debug, Deserialize)]
struct GraphqlRepositoryData {
    repository: GraphqlRepository,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlRepository {
    pull_request: GraphqlPullRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlPullRequest {
    review_threads: GraphqlReviewThreads,
}

#[derive(Debug, Deserialize)]
struct GraphqlReviewThreads {
    nodes: Vec<GraphqlReviewThread>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlReviewThread {
    is_resolved: bool,
    comments: GraphqlThreadComments,
}

#[derive(Debug, Deserialize)]
struct GraphqlThreadComments {
    nodes: Vec<GraphqlCommentNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct GraphqlCommentNode {
    database_id: u64,
    author: Option<GhCommentAuthor>,
    body: String,
    created_at: String,
    path: String,
    line: Option<u32>,
    original_line: Option<u32>,
    pull_request_review: Option<GraphqlPullRequestReview>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlPullRequestReview {
    database_id: u64,
}

async fn fetch_review_threads_graphql(
    repo_path: &str,
    pr_number: u64,
) -> Result<Vec<PRComment>, String> {
    let gh_path = find_cli_tool("gh")?;

    // Get owner and repo name first
    let repo_info = get_repo_from_remote(repo_path.to_string())
        .await?
        .ok_or("Failed to get repo info")?;
    let parts: Vec<&str> = repo_info.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repo info format".to_string());
    }
    let owner = parts[0];
    let repo = parts[1];

    let query = format!(
        "query {{ \
            repository(owner: \"{}\", name: \"{}\") {{ \
                pullRequest(number: {}) {{ \
                    reviewThreads(last: 100) {{ \
                        nodes {{ \
                            isResolved \
                            comments(first: 100) {{ \
                                nodes {{ \
                                    databaseId \
                                    author {{ login }} \
                                    body \
                                    createdAt \
                                    path \
                                    line \
                                    originalLine \
                                    pullRequestReview {{ databaseId }} \
                                }} \
                            }} \
                        }} \
                    }} \
                }} \
            }} \
        }}",
        owner, repo, pr_number
    );

    let output = Command::new(&gh_path)
        .args(["api", "graphql", "-f", &format!("query={}", query)])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh graphql: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh graphql failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let response: GraphqlThreadResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse GraphQL response: {}", e))?;

    let mut comments = Vec::new();

    for thread in response.data.repository.pull_request.review_threads.nodes {
        let is_resolved = thread.is_resolved;
        for comment in thread.comments.nodes {
            comments.push(PRComment {
                author: comment
                    .author
                    .map(|a| a.login)
                    .unwrap_or_else(|| "ghost".to_string()),
                body: comment.body,
                created_at: comment.created_at,
                comment_type: "review_thread".to_string(),
                state: None,
                path: Some(comment.path),
                line: comment.line.or(comment.original_line),
                review_id: comment
                    .pull_request_review
                    .map(|r| r.database_id.to_string()),
                is_resolved,
            });
        }
    }

    Ok(comments)
}

#[tauri::command]
pub async fn get_pr_details(repo_path: String, pr_number: u64) -> Result<PRDetailedInfo, String> {
    let gh_path = find_cli_tool("gh")?;
    let pr_ref = format!("{}", pr_number);

    let output = Command::new(&gh_path)
        .args([
            "pr",
            "view",
            &pr_ref,
            "--json",
            "mergeStateStatus,mergeable,body,comments,reviews,reviewDecision",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let pr: GhPRDetailedResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let mut all_comments: Vec<PRComment> = pr
        .comments
        .into_iter()
        .map(|c| PRComment {
            author: c.author.login,
            body: c.body,
            created_at: c.created_at,
            comment_type: "issue".to_string(),
            state: None,
            path: None,
            line: None,
            review_id: None,
            is_resolved: false,
        })
        .collect();

    let rest_reviews = fetch_reviews_rest_api(&repo_path, pr_number).await?;
    eprintln!("DEBUG: Found {} reviews from REST API", rest_reviews.len());
    for review in rest_reviews {
        eprintln!(
            "DEBUG: Review - id: {}, author: {}, state: {}, has_body: {}",
            review.id,
            review.user.login,
            review.state,
            !review.body.is_empty()
        );
        all_comments.push(PRComment {
            author: review.user.login,
            body: review.body,
            created_at: review.submitted_at.unwrap_or_default(),
            comment_type: "review".to_string(),
            state: Some(review.state),
            path: None,
            line: None,
            review_id: Some(review.id.to_string()),
            is_resolved: false,
        });
    }

    // Fetch review threads via GraphQL to get isResolved status, with a REST fallback so comments stay visible.
    let review_thread_comments = match fetch_review_threads_graphql(&repo_path, pr_number).await {
        Ok(comments) => comments,
        Err(e) => {
            eprintln!("DEBUG: Failed to fetch review threads via GraphQL: {}", e);
            let fallback_comments = fetch_review_comments_rest_api(&repo_path, pr_number).await?;
            fallback_comments
                .into_iter()
                .map(|rc| PRComment {
                    author: rc.user.login,
                    body: rc.body,
                    created_at: rc.created_at,
                    comment_type: "review_thread".to_string(),
                    state: None,
                    path: Some(rc.path),
                    line: rc.line.or(rc.original_line),
                    review_id: rc.pull_request_review_id.map(|id| id.to_string()),
                    is_resolved: false,
                })
                .collect()
        }
    };

    eprintln!(
        "DEBUG: Fetched {} review thread comments via GraphQL",
        review_thread_comments.len()
    );
    all_comments.extend(review_thread_comments);

    all_comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));

    eprintln!("DEBUG: Final comment breakdown:");
    eprintln!(
        "  - Issue comments: {}",
        all_comments
            .iter()
            .filter(|c| c.comment_type == "issue")
            .count()
    );
    eprintln!(
        "  - Reviews: {}",
        all_comments
            .iter()
            .filter(|c| c.comment_type == "review")
            .count()
    );
    eprintln!(
        "  - Review threads: {}",
        all_comments
            .iter()
            .filter(|c| c.comment_type == "review_thread")
            .count()
    );
    eprintln!(
        "DEBUG: Total comments being returned: {}",
        all_comments.len()
    );

    Ok(PRDetailedInfo {
        merge_state_status: pr.merge_state_status,
        mergeable: pr.mergeable,
        comments: all_comments,
        review_decision: pr.review_decision,
        body: pr.body,
    })
}

// ── PR Files ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRFile {
    pub path: String,
    pub additions: u64,
    pub deletions: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPRFile {
    path: String,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
}

#[tauri::command]
pub async fn get_pr_files(repo_path: String, pr_number: u64) -> Result<Vec<PRFile>, String> {
    let gh_path = find_cli_tool("gh")?;
    let pr_ref = format!("{}", pr_number);

    let output = Command::new(&gh_path)
        .args(["pr", "view", &pr_ref, "--json", "files"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    #[derive(Debug, Deserialize)]
    struct FilesWrapper {
        #[serde(default)]
        files: Vec<GhPRFile>,
    }

    let wrapper: FilesWrapper =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(wrapper
        .files
        .into_iter()
        .map(|f| PRFile {
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
        })
        .collect())
}

// ── PR Commits ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRCommit {
    pub oid: String,
    pub message_headline: String,
    pub committed_date: String,
    pub author_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPRCommitAuthor {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPRCommit {
    oid: String,
    message_headline: String,
    #[serde(default)]
    committed_date: Option<String>,
    #[serde(default)]
    authors: Vec<GhPRCommitAuthor>,
}

#[tauri::command]
pub async fn get_pr_commits(repo_path: String, pr_number: u64) -> Result<Vec<PRCommit>, String> {
    let gh_path = find_cli_tool("gh")?;
    let pr_ref = format!("{}", pr_number);

    let output = Command::new(&gh_path)
        .args(["pr", "view", &pr_ref, "--json", "commits"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    #[derive(Debug, Deserialize)]
    struct CommitsWrapper {
        #[serde(default)]
        commits: Vec<GhPRCommit>,
    }

    let wrapper: CommitsWrapper =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(wrapper
        .commits
        .into_iter()
        .map(|c| PRCommit {
            oid: c.oid,
            message_headline: c.message_headline,
            committed_date: c.committed_date.unwrap_or_default(),
            author_name: c
                .authors
                .into_iter()
                .next()
                .and_then(|a| a.name)
                .unwrap_or_else(|| "unknown".to_string()),
        })
        .collect())
}

// ── PR Diff for a specific file ──────────────────────────────────────

#[tauri::command]
pub async fn get_pr_file_diff(repo_path: String, pr_number: u64) -> Result<String, String> {
    let gh_path = find_cli_tool("gh")?;
    let pr_ref = format!("{}", pr_number);

    let output = Command::new(&gh_path)
        .args(["pr", "diff", &pr_ref])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreatePRResult {
    pub number: u64,
    pub url: String,
}

#[tauri::command]
pub async fn create_pr(
    repo_path: String,
    title: String,
    body: Option<String>,
    base: Option<String>,
    draft: bool,
) -> Result<CreatePRResult, String> {
    let mut args = vec!["pr", "create", "--title", &title];

    let body_str = body.unwrap_or_default();
    if !body_str.is_empty() {
        args.push("--body");
        args.push(&body_str);
    }

    let base_str = base.unwrap_or_else(|| "main".to_string());
    args.push("--base");
    args.push(&base_str);

    if draft {
        args.push("--draft");
    }

    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create PR: {}", stderr));
    }

    let url = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {}", e))?
        .trim()
        .to_string();

    let number = url
        .split('/')
        .next_back()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(CreatePRResult { number, url })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CubicReviewResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_cubic_review(repo_path: String) -> Result<CubicReviewResult, String> {
    let cubic_path = find_cli_tool("cubic")?;
    let output = Command::new(&cubic_path)
        .args(["review"])
        .current_dir(&repo_path)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();

            if out.status.success() {
                Ok(CubicReviewResult {
                    success: true,
                    output: stdout,
                    error: None,
                })
            } else {
                Ok(CubicReviewResult {
                    success: false,
                    output: stdout,
                    error: Some(stderr),
                })
            }
        }
        Err(e) => Err(format!("Failed to run cubic: {}", e)),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergePRResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeStrategy {
    Merge,
    Squash,
    Rebase,
}

impl MergeStrategy {
    fn as_flag(&self) -> &'static str {
        match self {
            MergeStrategy::Merge => "--merge",
            MergeStrategy::Squash => "--squash",
            MergeStrategy::Rebase => "--rebase",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoMergeSettings {
    merge_commit_allowed: bool,
    squash_merge_allowed: bool,
    rebase_merge_allowed: bool,
}

fn get_default_merge_strategy(gh_path: &str, repo_path: &str) -> Result<MergeStrategy, String> {
    let output = Command::new(gh_path)
        .args([
            "repo",
            "view",
            "--json",
            "mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to query repo settings: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get repo merge settings: {}", stderr));
    }

    let settings: RepoMergeSettings = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse repo settings: {}", e))?;

    if settings.merge_commit_allowed {
        Ok(MergeStrategy::Merge)
    } else if settings.squash_merge_allowed {
        Ok(MergeStrategy::Squash)
    } else if settings.rebase_merge_allowed {
        Ok(MergeStrategy::Rebase)
    } else {
        Err("No merge methods are allowed for this repository".to_string())
    }
}

#[tauri::command]
pub async fn merge_pr(
    repo_path: String,
    pr_number: u64,
    strategy: Option<MergeStrategy>,
) -> Result<MergePRResult, String> {
    let gh_path = find_cli_tool("gh")?;

    let strategy = match strategy {
        Some(s) => s,
        None => get_default_merge_strategy(&gh_path, &repo_path)?,
    };

    let output = Command::new(&gh_path)
        .args(["pr", "merge", &pr_number.to_string(), strategy.as_flag()])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(MergePRResult {
            success: true,
            message: stdout.trim().to_string(),
        })
    } else {
        Ok(MergePRResult {
            success: false,
            message: stderr.trim().to_string(),
        })
    }
}

#[tauri::command]
pub async fn get_assigned_issues() -> Result<Vec<GithubIssue>, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args([
            "search",
            "issues",
            "--assignee=@me",
            "--state=open",
            "--limit=50",
            "--json",
            "number,title,url,state,repository,createdAt,updatedAt,author,labels",
        ])
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh search issues failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    let issues: Vec<GhSearchIssue> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let result = issues
        .into_iter()
        .map(|i| GithubIssue {
            number: i.number,
            title: i.title,
            url: i.url,
            state: i.state,
            repo_name: i.repository.name_with_owner,
            author: i.author.login,
            created_at: i.created_at,
            updated_at: i.updated_at,
            labels: i.labels.into_iter().map(|l| l.name).collect(),
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn get_notifications() -> Result<Vec<GithubNotification>, String> {
    let gh_path = find_cli_tool("gh")?;
    let output = Command::new(&gh_path)
        .args(["api", "notifications"])
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh api notifications failed: {}", stderr));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    let notifs: Vec<GhApiNotification> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let result = notifs
        .into_iter()
        .map(|n| GithubNotification {
            id: n.id,
            reason: n.reason,
            repo_name: n.repository.full_name,
            subject_title: n.subject.title,
            subject_type: n.subject.type_,
            subject_url: n.subject.url,
            unread: n.unread,
            updated_at: n.updated_at,
        })
        .collect();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn graphql_pr_with_review_threads(review_threads: serde_json::Value) -> serde_json::Value {
        serde_json::json!({
            "number": 42,
            "title": "PR 42",
            "url": "https://example.com/pr/42",
            "state": "OPEN",
            "headRefName": "feature",
            "reviewThreads": review_threads,
        })
    }

    fn pr_status(number: u64, state: &str) -> PRStatus {
        PRStatus {
            number,
            title: format!("PR {number}"),
            url: format!("https://example.com/pr/{number}"),
            state: state.to_string(),
            merged: false,
            draft: false,
            review_decision: None,
            checks_status: None,
            mergeable: None,
            additions: 0,
            deletions: 0,
            head_branch: "feature".to_string(),
            base_branch: "master".to_string(),
            author: "tester".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            labels: Vec::new(),
            requested_reviewers: Vec::new(),
            has_unresolved_review_threads: false,
            is_bot: false,
        }
    }

    #[test]
    fn graphql_pr_status_marks_only_unresolved_review_threads() {
        let with_unresolved = parse_graphql_pr_node(&graphql_pr_with_review_threads(
            serde_json::json!({ "nodes": [{ "isResolved": true }, { "isResolved": false }] }),
        ))
        .expect("expected PR status");
        let all_resolved = parse_graphql_pr_node(&graphql_pr_with_review_threads(
            serde_json::json!({ "nodes": [{ "isResolved": true }] }),
        ))
        .expect("expected PR status");

        assert!(with_unresolved.status.has_unresolved_review_threads);
        assert!(!all_resolved.status.has_unresolved_review_threads);
    }

    #[test]
    fn review_threads_next_cursor_requires_another_page() {
        let first_page = serde_json::json!({
            "nodes": [{ "isResolved": true }],
            "pageInfo": { "hasNextPage": true, "endCursor": "next-page" }
        });
        let final_page = serde_json::json!({
            "nodes": [{ "isResolved": true }],
            "pageInfo": { "hasNextPage": false, "endCursor": null }
        });

        assert_eq!(
            review_threads_next_cursor(&first_page),
            Some("next-page".to_string())
        );
        assert_eq!(review_threads_next_cursor(&final_page), None);
    }

    #[test]
    fn resolve_candidate_for_worktree_prefers_matching_head_oid_when_present() {
        let worktree = WorktreePRLookup {
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature".to_string(),
            head_oid: Some("wanted".to_string()),
        };
        let candidates = vec![
            PRStatusCandidate {
                status: pr_status(41, "open"),
                head_oid: Some("different".to_string()),
            },
            PRStatusCandidate {
                status: pr_status(42, "open"),
                head_oid: Some("wanted".to_string()),
            },
        ];

        let resolved = resolve_candidate_for_worktree(&worktree, &candidates)
            .expect("expected exact head match");

        assert_eq!(resolved.number, 42);
    }

    #[test]
    fn resolve_candidate_for_worktree_falls_back_to_single_open_pr_when_head_oid_is_stale() {
        let worktree = WorktreePRLookup {
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature".to_string(),
            head_oid: Some("stale-local-head".to_string()),
        };
        let candidates = vec![
            PRStatusCandidate {
                status: pr_status(41, "closed"),
                head_oid: Some("older".to_string()),
            },
            PRStatusCandidate {
                status: pr_status(42, "open"),
                head_oid: Some("current-remote-head".to_string()),
            },
        ];

        let resolved = resolve_candidate_for_worktree(&worktree, &candidates)
            .expect("expected open PR fallback for stale worktree");

        assert_eq!(resolved.number, 42);
    }

    #[test]
    fn resolve_candidate_for_worktree_returns_none_when_multiple_open_prs_exist_without_head_match()
    {
        let worktree = WorktreePRLookup {
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature".to_string(),
            head_oid: Some("stale-local-head".to_string()),
        };
        let candidates = vec![
            PRStatusCandidate {
                status: pr_status(41, "open"),
                head_oid: Some("older".to_string()),
            },
            PRStatusCandidate {
                status: pr_status(42, "open"),
                head_oid: Some("current-remote-head".to_string()),
            },
        ];

        assert!(resolve_candidate_for_worktree(&worktree, &candidates).is_none());
    }

    #[test]
    fn resolve_candidate_for_worktree_falls_back_to_open_pr_without_head_oid() {
        let worktree = WorktreePRLookup {
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature".to_string(),
            head_oid: None,
        };
        let candidates = vec![
            PRStatusCandidate {
                status: pr_status(41, "closed"),
                head_oid: Some("old".to_string()),
            },
            PRStatusCandidate {
                status: pr_status(42, "open"),
                head_oid: Some("current".to_string()),
            },
        ];

        let resolved = resolve_candidate_for_worktree(&worktree, &candidates)
            .expect("expected open PR fallback");

        assert_eq!(resolved.number, 42);
    }
}
