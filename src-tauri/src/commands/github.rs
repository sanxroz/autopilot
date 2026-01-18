use serde::{Deserialize, Serialize};
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
    pub additions: u64,
    pub deletions: u64,
    pub head_branch: String,
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
    review_decision: Option<String>,
    #[serde(default)]
    status_check_rollup: Vec<GhStatusCheck>,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
    head_ref_name: String,
}

fn compute_checks_status(checks: &[GhStatusCheck]) -> Option<String> {
    if checks.is_empty() {
        return None;
    }
    
    let has_failure = checks.iter().any(|c| {
        c.conclusion.as_deref() == Some("FAILURE") || 
        c.conclusion.as_deref() == Some("ERROR") ||
        c.state.as_deref() == Some("FAILURE") ||
        c.state.as_deref() == Some("ERROR")
    });
    
    let has_pending = checks.iter().any(|c| {
        c.conclusion.is_none() && c.state.as_deref() == Some("PENDING")
    });
    
    if has_failure {
        Some("failure".to_string())
    } else if has_pending {
        Some("pending".to_string())
    } else {
        Some("success".to_string())
    }
}

#[tauri::command]
pub fn check_gh_cli() -> Result<bool, String> {
    match Command::new("gh").arg("--version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn check_gh_auth() -> Result<String, String> {
    let output = Command::new("gh")
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

const PR_JSON_FIELDS: &str = "number,title,url,state,isDraft,mergedAt,reviewDecision,statusCheckRollup,additions,deletions,headRefName";

#[tauri::command]
pub async fn get_pr_for_branch(
    repo_path: String,
    branch: String,
) -> Result<Option<PRStatus>, String> {
    let output = Command::new("gh")
        .args([
            "pr", "list",
            "--head", &branch,
            "--state", "all",
            "--limit", "1",
            "--json", PR_JSON_FIELDS,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let prs: Vec<GhPRResponse> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(prs.into_iter().next().map(|pr| PRStatus {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: pr.state.to_lowercase(),
        merged: pr.merged_at.is_some(),
        draft: pr.is_draft,
        review_decision: pr.review_decision.filter(|s| !s.is_empty()),
        checks_status: compute_checks_status(&pr.status_check_rollup),
        additions: pr.additions,
        deletions: pr.deletions,
        head_branch: pr.head_ref_name,
    }))
}

#[derive(Debug, Deserialize)]
pub struct RepoWithBranches {
    pub repo_path: String,
    pub branches: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RepoPRStatuses {
    pub repo_path: String,
    pub statuses: Vec<PRStatus>,
}

#[tauri::command]
pub async fn get_all_prs_for_repos(repos: Vec<RepoWithBranches>) -> Result<Vec<RepoPRStatuses>, String> {
    let mut results = Vec::new();
    
    for repo in repos {
        let mut statuses = Vec::new();
        
        for branch in &repo.branches {
            let output = Command::new("gh")
                .args([
                    "pr", "list",
                    "--head", branch,
                    "--state", "all",
                    "--limit", "1",
                    "--json", PR_JSON_FIELDS,
                ])
                .current_dir(&repo.repo_path)
                .output();

            if let Ok(out) = output {
                if out.status.success() {
                    let stdout = String::from_utf8(out.stdout).unwrap_or_default();
                    let prs: Vec<GhPRResponse> = serde_json::from_str(&stdout).unwrap_or_default();
                    if let Some(pr) = prs.into_iter().next() {
                        statuses.push(PRStatus {
                            number: pr.number,
                            title: pr.title,
                            url: pr.url,
                            state: pr.state.to_lowercase(),
                            merged: pr.merged_at.is_some(),
                            draft: pr.is_draft,
                            review_decision: pr.review_decision.filter(|s| !s.is_empty()),
                            checks_status: compute_checks_status(&pr.status_check_rollup),
                            additions: pr.additions,
                            deletions: pr.deletions,
                            head_branch: pr.head_ref_name,
                        });
                    }
                }
            }
        }

        results.push(RepoPRStatuses { repo_path: repo.repo_path, statuses });
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_pr_status(
    repo_path: String,
    pr_number: u64,
) -> Result<PRStatus, String> {
    let pr_ref = format!("{}", pr_number);
    
    let output = Command::new("gh")
        .args([
            "pr", "view", &pr_ref,
            "--json", PR_JSON_FIELDS,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let pr: GhPRResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(PRStatus {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: pr.state.to_lowercase(),
        merged: pr.merged_at.is_some(),
        draft: pr.is_draft,
        review_decision: pr.review_decision.filter(|s| !s.is_empty()),
        checks_status: compute_checks_status(&pr.status_check_rollup),
        additions: pr.additions,
        deletions: pr.deletions,
        head_branch: pr.head_ref_name,
    })
}

#[tauri::command]
pub async fn get_repo_from_remote(repo_path: String) -> Result<Option<String>, String> {
    let output = Command::new("gh")
        .args(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
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
pub struct PRCheck {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRChecksResult {
    pub checks: Vec<PRCheck>,
    pub overall_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhCheckRun {
    name: String,
    state: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    link: Option<String>,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default)]
    completed_at: Option<String>,
}

#[tauri::command]
pub async fn get_pr_checks(repo_path: String, pr_number: u64) -> Result<PRChecksResult, String> {
    let pr_ref = format!("{}", pr_number);
    
    let output = Command::new("gh")
        .args([
            "pr", "checks", &pr_ref,
            "--json", "name,state,description,link,startedAt,completedAt",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("no checks") {
            return Ok(PRChecksResult {
                checks: vec![],
                overall_status: "none".to_string(),
            });
        }
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let gh_checks: Vec<GhCheckRun> = serde_json::from_str(&stdout).unwrap_or_default();

    let checks: Vec<PRCheck> = gh_checks
        .into_iter()
        .map(|c| {
            let conclusion = match c.state.as_str() {
                "SUCCESS" => Some("success".to_string()),
                "FAILURE" | "ERROR" => Some("failure".to_string()),
                "CANCELLED" => Some("cancelled".to_string()),
                "PENDING" | "QUEUED" | "IN_PROGRESS" => None,
                _ => None,
            };
            let status = if conclusion.is_some() { "completed".to_string() } else { "in_progress".to_string() };
            PRCheck {
                name: c.name,
                status,
                conclusion,
                url: c.link,
                started_at: c.started_at,
                completed_at: c.completed_at,
            }
        })
        .collect();

    let overall_status = if checks.is_empty() {
        "none".to_string()
    } else if checks.iter().any(|c| c.conclusion.as_deref() == Some("failure")) {
        "failure".to_string()
    } else if checks.iter().any(|c| c.conclusion.is_none()) {
        "pending".to_string()
    } else {
        "success".to_string()
    };

    Ok(PRChecksResult {
        checks,
        overall_status,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRDetailedInfo {
    pub merge_state_status: String,
    pub mergeable: String,
    pub comments: Vec<PRComment>,
    pub review_decision: Option<String>,
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
struct GhPRDetailedResponse {
    merge_state_status: String,
    mergeable: String,
    #[serde(default)]
    comments: Vec<GhComment>,
    #[serde(default)]
    review_decision: Option<String>,
}

#[tauri::command]
pub async fn get_pr_details(repo_path: String, pr_number: u64) -> Result<PRDetailedInfo, String> {
    let pr_ref = format!("{}", pr_number);
    
    let output = Command::new("gh")
        .args([
            "pr", "view", &pr_ref,
            "--json", "mergeStateStatus,mergeable,comments,reviewDecision",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 output: {}", e))?;

    let pr: GhPRDetailedResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(PRDetailedInfo {
        merge_state_status: pr.merge_state_status,
        mergeable: pr.mergeable,
        comments: pr.comments.into_iter().map(|c| PRComment {
            author: c.author.login,
            body: c.body,
            created_at: c.created_at,
        }).collect(),
        review_decision: pr.review_decision,
    })
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

    let output = Command::new("gh")
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
        .last()
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
    let output = Command::new("cubic")
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
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Err("cubic CLI not found. Please install cubic first.".to_string())
            } else {
                Err(format!("Failed to run cubic: {}", e))
            }
        }
    }
}
