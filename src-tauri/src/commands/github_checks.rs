use super::cli_tools::find_cli_tool;
use serde::{Deserialize, Serialize};
use std::process::Command;

const MAX_FAILED_LOG_EXCERPT_LINES: usize = 80;
const MAX_FAILED_LOG_EXCERPT_CHARS: usize = 6_000;
#[cfg(test)]
const TEST_GH_PATH_ENV_VAR: &str = "AUTOPILOT_TEST_GH_PATH";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRCheck {
    pub name: String,
    pub bucket: String,
    pub state: String,
    pub description: Option<String>,
    pub workflow: Option<String>,
    pub event: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub is_actions_job: bool,
    pub job_id: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRChecksSummary {
    pub total: usize,
    pub passing: usize,
    pub failing: usize,
    pub pending: usize,
    pub skipped: usize,
    pub cancelled: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRChecksResult {
    pub checks: Vec<PRCheck>,
    pub overall_status: String,
    pub summary: PRChecksSummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRCheckStep {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub number: u64,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PRCheckDetail {
    pub steps: Vec<PRCheckStep>,
    pub failed_log_excerpt: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhCheckRun {
    bucket: Option<String>,
    #[serde(default)]
    completed_at: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    event: Option<String>,
    #[serde(default)]
    link: Option<String>,
    name: String,
    #[serde(default)]
    started_at: Option<String>,
    state: Option<String>,
    #[serde(default)]
    workflow: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRunViewResponse {
    jobs: Vec<GhRunViewJob>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRunViewJob {
    #[serde(rename = "databaseId")]
    database_id: u64,
    #[serde(default)]
    steps: Vec<GhRunViewStep>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRunViewStep {
    #[serde(default)]
    completed_at: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    name: String,
    number: u64,
    #[serde(default)]
    started_at: Option<String>,
    status: String,
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_optional_timestamp(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with("0001-01-01") {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn parse_actions_job_id(url: &Option<String>) -> Option<u64> {
    url.as_deref()
        .and_then(|value| {
            value
                .split("/jobs/")
                .nth(1)
                .or_else(|| value.split("/job/").nth(1))
        })
        .and_then(|suffix| suffix.split(['/', '?', '#']).next())
        .and_then(|job_id| job_id.parse::<u64>().ok())
}

fn compute_overall_status(summary: &PRChecksSummary) -> String {
    if summary.total == 0 {
        return "none".to_string();
    }
    if summary.failing > 0 {
        return "failure".to_string();
    }
    if summary.pending > 0 {
        return "pending".to_string();
    }
    if summary.cancelled > 0 && summary.passing == 0 {
        return "cancelled".to_string();
    }
    if summary.skipped == summary.total {
        return "skipped".to_string();
    }
    "success".to_string()
}

fn is_failed_step(status: &str, conclusion: Option<&str>) -> bool {
    status.eq_ignore_ascii_case("failure")
        || matches!(
            conclusion,
            Some("failure" | "cancelled" | "timed_out" | "action_required")
        )
}

fn truncate_failed_log_excerpt(logs: &str) -> String {
    let lines = logs.lines().collect::<Vec<_>>();
    let log_tail = if lines.len() <= MAX_FAILED_LOG_EXCERPT_LINES {
        logs.to_string()
    } else {
        lines[lines.len() - MAX_FAILED_LOG_EXCERPT_LINES..].join("\n")
    };

    let tail = if log_tail.chars().count() <= MAX_FAILED_LOG_EXCERPT_CHARS {
        log_tail
    } else {
        log_tail
            .chars()
            .rev()
            .take(MAX_FAILED_LOG_EXCERPT_CHARS)
            .collect::<String>()
            .chars()
            .rev()
            .collect()
    };

    if tail == logs {
        tail
    } else {
        format!(
            "[showing the final failure output; open on GitHub for the full failed log]\n{tail}",
        )
    }
}

fn select_job_for_detail(jobs: Vec<GhRunViewJob>, job_id: u64) -> Result<GhRunViewJob, String> {
    jobs.into_iter()
        .find(|job| job.database_id == job_id)
        .ok_or_else(|| {
            format!("Failed to load check details: GitHub returned no metadata for job {job_id}.")
        })
}

fn summarize_checks(checks: &[PRCheck]) -> PRChecksSummary {
    let mut summary = PRChecksSummary {
        total: checks.len(),
        passing: 0,
        failing: 0,
        pending: 0,
        skipped: 0,
        cancelled: 0,
    };

    for check in checks {
        match check.bucket.as_str() {
            "pass" => summary.passing += 1,
            "fail" => summary.failing += 1,
            "pending" => summary.pending += 1,
            "skipping" => summary.skipped += 1,
            "cancel" => summary.cancelled += 1,
            _ => {}
        }
    }

    summary
}

fn find_gh_path() -> Result<String, String> {
    #[cfg(test)]
    if let Ok(path) = std::env::var(TEST_GH_PATH_ENV_VAR) {
        if !path.trim().is_empty() {
            return Ok(path);
        }
    }

    find_cli_tool("gh")
}

#[tauri::command]
pub async fn get_pr_checks(repo_path: String, pr_number: u64) -> Result<PRChecksResult, String> {
    let gh_path = find_gh_path()?;
    let output = Command::new(&gh_path)
        .args([
            "pr",
            "checks",
            &pr_number.to_string(),
            "--json",
            "bucket,completedAt,description,event,link,name,startedAt,state,workflow",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|error| format!("Failed to run gh command: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("no checks") {
            return Ok(PRChecksResult {
                checks: Vec::new(),
                overall_status: "none".to_string(),
                summary: PRChecksSummary {
                    total: 0,
                    passing: 0,
                    failing: 0,
                    pending: 0,
                    skipped: 0,
                    cancelled: 0,
                },
            });
        }
        return Err(format!("gh command failed: {stderr}"));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Invalid UTF-8 output: {error}"))?;
    let gh_checks: Vec<GhCheckRun> = serde_json::from_str(&stdout)
        .map_err(|error| format!("Failed to parse gh pr checks output: {error}"))?;

    let checks = gh_checks
        .into_iter()
        .map(|check| {
            let bucket = check.bucket.unwrap_or_else(|| "unknown".to_string());
            let state = check.state.unwrap_or_else(|| "UNKNOWN".to_string());
            let url = normalize_optional_text(check.link);
            let job_id = parse_actions_job_id(&url);

            PRCheck {
                name: check.name,
                bucket,
                state,
                description: normalize_optional_text(check.description),
                workflow: normalize_optional_text(check.workflow),
                event: normalize_optional_text(check.event),
                url,
                started_at: normalize_optional_timestamp(check.started_at),
                completed_at: normalize_optional_timestamp(check.completed_at),
                is_actions_job: job_id.is_some(),
                job_id,
            }
        })
        .collect::<Vec<_>>();

    let summary = summarize_checks(&checks);

    Ok(PRChecksResult {
        overall_status: compute_overall_status(&summary),
        summary,
        checks,
    })
}

#[tauri::command]
pub async fn get_pr_check_detail(
    repo_path: String,
    check_url: Option<String>,
) -> Result<PRCheckDetail, String> {
    let job_id = parse_actions_job_id(&check_url)
        .ok_or_else(|| "Detailed logs are only available for GitHub Actions checks.".to_string())?;
    let gh_path = find_gh_path()?;

    let metadata_output = Command::new(&gh_path)
        .args([
            "run",
            "view",
            "--job",
            &job_id.to_string(),
            "--json",
            "jobs",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|error| format!("Failed to run gh command: {error}"))?;

    if !metadata_output.status.success() {
        let stderr = String::from_utf8_lossy(&metadata_output.stderr)
            .trim()
            .to_string();
        return Err(if stderr.is_empty() {
            "Failed to load check details".to_string()
        } else {
            format!("Failed to load check details: {stderr}")
        });
    }

    let metadata_stdout = String::from_utf8(metadata_output.stdout)
        .map_err(|error| format!("Invalid UTF-8 output: {error}"))?;
    let run_view: GhRunViewResponse = serde_json::from_str(&metadata_stdout)
        .map_err(|error| format!("Failed to parse gh run view output: {error}"))?;

    let job = select_job_for_detail(run_view.jobs, job_id)?;

    let steps = job
        .steps
        .into_iter()
        .map(|step| PRCheckStep {
            name: step.name,
            status: step.status,
            conclusion: normalize_optional_text(step.conclusion),
            number: step.number,
            started_at: normalize_optional_timestamp(step.started_at),
            completed_at: normalize_optional_timestamp(step.completed_at),
        })
        .collect::<Vec<_>>();

    let has_failed_step = steps
        .iter()
        .any(|step| is_failed_step(&step.status, step.conclusion.as_deref()));

    let failed_log_excerpt = if has_failed_step {
        let log_output = Command::new(&gh_path)
            .args(["run", "view", "--job", &job_id.to_string(), "--log-failed"])
            .current_dir(&repo_path)
            .output()
            .map_err(|error| format!("Failed to run gh command: {error}"))?;

        if log_output.status.success() {
            let logs = String::from_utf8(log_output.stdout)
                .map_err(|error| format!("Invalid UTF-8 output: {error}"))?;
            normalize_optional_text(Some(truncate_failed_log_excerpt(&logs)))
        } else {
            None
        }
    } else {
        None
    };

    Ok(PRCheckDetail {
        steps,
        failed_log_excerpt,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        compute_overall_status, get_pr_check_detail, parse_actions_job_id, select_job_for_detail,
        truncate_failed_log_excerpt, GhRunViewJob, PRChecksSummary, MAX_FAILED_LOG_EXCERPT_CHARS,
        MAX_FAILED_LOG_EXCERPT_LINES, TEST_GH_PATH_ENV_VAR,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::sync::LazyLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_MUTEX: LazyLock<tokio::sync::Mutex<()>> =
        LazyLock::new(|| tokio::sync::Mutex::new(()));

    fn unique_temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before UNIX_EPOCH")
            .as_nanos();

        std::env::temp_dir().join(format!(
            "autopilot-github-checks-test-{}-{}-{}",
            std::process::id(),
            name,
            nanos
        ))
    }

    fn build_summary(
        total: usize,
        passing: usize,
        failing: usize,
        pending: usize,
        skipped: usize,
        cancelled: usize,
    ) -> PRChecksSummary {
        PRChecksSummary {
            total,
            passing,
            failing,
            pending,
            skipped,
            cancelled,
        }
    }

    #[test]
    fn parse_actions_job_id_supports_jobs_urls() {
        let url =
            Some("https://github.com/example/repo/actions/runs/123/jobs/456?pr=1".to_string());

        assert_eq!(parse_actions_job_id(&url), Some(456));
    }

    #[test]
    fn parse_actions_job_id_supports_job_urls() {
        let url = Some("https://github.com/example/repo/actions/runs/123/job/456".to_string());

        assert_eq!(parse_actions_job_id(&url), Some(456));
    }

    #[test]
    fn compute_overall_status_prefers_cancelled_when_only_cancelled_and_skipped_exist() {
        let summary = build_summary(3, 0, 0, 0, 1, 2);

        assert_eq!(compute_overall_status(&summary), "cancelled");
    }

    #[test]
    fn truncate_failed_log_excerpt_keeps_the_end_of_long_logs() {
        let long_logs = (0..=MAX_FAILED_LOG_EXCERPT_LINES)
            .map(|line| format!("line {line}"))
            .collect::<Vec<_>>()
            .join("\n");
        let truncated = truncate_failed_log_excerpt(&long_logs);

        assert!(truncated.contains("[showing the final failure output"));
        assert!(!truncated.contains("line 0\n"));
        assert!(truncated.ends_with("line 80"));
    }

    #[test]
    fn truncate_failed_log_excerpt_limits_a_single_long_line() {
        let long_log = "x".repeat(MAX_FAILED_LOG_EXCERPT_CHARS + 1);
        let truncated = truncate_failed_log_excerpt(&long_log);

        assert!(truncated.contains("[showing the final failure output"));
        assert!(truncated.ends_with('x'));
        assert!(truncated.chars().count() < MAX_FAILED_LOG_EXCERPT_CHARS + 100);
    }

    #[test]
    fn select_job_for_detail_picks_requested_job_from_run_jobs() {
        let matching_job_id = 456;
        let selected_job = select_job_for_detail(
            vec![
                GhRunViewJob {
                    database_id: 123,
                    steps: Vec::new(),
                },
                GhRunViewJob {
                    database_id: matching_job_id,
                    steps: vec![super::GhRunViewStep {
                        completed_at: Some("2026-06-29T15:31:36Z".to_string()),
                        conclusion: Some("failure".to_string()),
                        name: "Check TypeScript".to_string(),
                        number: 8,
                        started_at: Some("2026-06-29T15:29:13Z".to_string()),
                        status: "completed".to_string(),
                    }],
                },
            ],
            matching_job_id,
        )
        .expect("expected the matching job to be selected");

        assert_eq!(selected_job.database_id, matching_job_id);
        assert_eq!(selected_job.steps.len(), 1);
        assert_eq!(selected_job.steps[0].name, "Check TypeScript");
    }

    #[test]
    fn select_job_for_detail_errors_when_job_is_missing() {
        let error = select_job_for_detail(
            vec![GhRunViewJob {
                database_id: 123,
                steps: Vec::new(),
            }],
            456,
        )
        .expect_err("expected missing job to return an error");

        assert!(error.contains("job 456"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn get_pr_check_detail_selects_matching_job_from_multi_job_response() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = TEST_MUTEX.lock().await;
        let temp_dir = unique_temp_dir("gh-detail");
        let repo_dir = temp_dir.join("repo");
        let gh_path = temp_dir.join("gh");
        fs::create_dir_all(&repo_dir).expect("create repo dir");

        let fake_gh_script = r#"#!/bin/sh
if [ "$1" = "run" ] && [ "$2" = "view" ] && [ "$3" = "--job" ] && [ "$5" = "--json" ] && [ "$6" = "jobs" ]; then
  cat <<'JSON'
{"jobs":[
  {"databaseId":84091081319,"steps":[{"name":"Set up job","status":"completed","conclusion":"success","number":1,"startedAt":"2026-06-29T15:25:54Z","completedAt":"2026-06-29T15:25:55Z"}]},
  {"databaseId":84091081384,"steps":[
    {"name":"Lint","status":"completed","conclusion":"success","number":7,"startedAt":"2026-06-29T15:26:55Z","completedAt":"2026-06-29T15:29:13Z"},
    {"name":"Check TypeScript","status":"completed","conclusion":"failure","number":8,"startedAt":"2026-06-29T15:29:13Z","completedAt":"2026-06-29T15:31:36Z"}
  ]}
]}
JSON
  exit 0
fi

if [ "$1" = "run" ] && [ "$2" = "view" ] && [ "$3" = "--job" ] && [ "$5" = "--log-failed" ]; then
  cat <<'LOG'
Type Check  Check TypeScript  Error: Invalid environment variables
Type Check  Check TypeScript  Found 1 error in src/lib/ai/code-review-service/__tests__/degradation-model-configs.test.ts:66
LOG
  exit 0
fi

echo "unexpected args: $*" >&2
exit 1
"#;

        fs::write(&gh_path, fake_gh_script).expect("write fake gh script");
        let mut permissions = fs::metadata(&gh_path).expect("gh metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&gh_path, permissions).expect("set gh permissions");

        std::env::set_var(TEST_GH_PATH_ENV_VAR, &gh_path);

        let detail = get_pr_check_detail(
            repo_dir.to_string_lossy().to_string(),
            Some(
                "https://github.com/example/repo/actions/runs/28383230623/job/84091081384"
                    .to_string(),
            ),
        )
        .await
        .expect("load check detail");

        std::env::remove_var(TEST_GH_PATH_ENV_VAR);
        fs::remove_dir_all(&temp_dir).expect("remove temp dir");

        assert_eq!(detail.steps.len(), 2);
        assert_eq!(detail.steps[1].name, "Check TypeScript");
        assert_eq!(detail.steps[1].conclusion.as_deref(), Some("failure"));
        assert!(detail
            .failed_log_excerpt
            .as_deref()
            .is_some_and(|logs| logs.contains("Invalid environment variables")));
    }
}
