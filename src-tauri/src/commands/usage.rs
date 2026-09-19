use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;
use std::time::{Duration, Instant};

const CODEX_USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
static CODEX_RETRY_AT: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static CLAUDE_RETRY_AT: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitWindow {
    #[serde(alias = "used_percent")]
    pub used_percent: f64,
    #[serde(alias = "window_minutes")]
    pub window_duration_mins: Option<u64>,
    #[serde(alias = "resets_at")]
    pub resets_at: Option<i64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitSnapshot {
    #[serde(alias = "limit_id")]
    pub limit_id: Option<String>,
    #[serde(alias = "limit_name")]
    pub limit_name: Option<String>,
    #[serde(alias = "plan_type")]
    pub plan_type: Option<String>,
    pub primary: Option<RateLimitWindow>,
    pub secondary: Option<RateLimitWindow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexUsage {
    pub rate_limits: RateLimitSnapshot,
    pub rate_limits_by_limit_id: HashMap<String, RateLimitSnapshot>,
}

fn clone_window(window: &RateLimitWindow) -> RateLimitWindow {
    RateLimitWindow {
        used_percent: window.used_percent,
        window_duration_mins: window.window_duration_mins,
        resets_at: window.resets_at,
    }
}

#[derive(Deserialize)]
struct CodexAuth {
    tokens: CodexTokens,
}

#[derive(Deserialize)]
struct CodexTokens {
    access_token: String,
    account_id: String,
}

#[derive(Deserialize)]
struct CodexApiWindow {
    used_percent: f64,
    limit_window_seconds: Option<u64>,
    reset_at: Option<i64>,
}

#[derive(Deserialize)]
struct CodexApiRateLimit {
    primary_window: Option<CodexApiWindow>,
    secondary_window: Option<CodexApiWindow>,
}

#[derive(Deserialize)]
struct CodexAdditionalRateLimit {
    limit_name: Option<String>,
    metered_feature: String,
    rate_limit: CodexApiRateLimit,
}

#[derive(Deserialize)]
struct CodexApiUsage {
    plan_type: Option<String>,
    rate_limit: CodexApiRateLimit,
    additional_rate_limits: Option<Vec<CodexAdditionalRateLimit>>,
}

fn codex_window(window: CodexApiWindow) -> RateLimitWindow {
    RateLimitWindow {
        used_percent: window.used_percent.clamp(0.0, 100.0),
        window_duration_mins: window.limit_window_seconds.map(|seconds| seconds / 60),
        resets_at: window.reset_at,
    }
}

fn convert_codex_usage(response: CodexApiUsage) -> Result<CodexUsage, String> {
    if response.rate_limit.primary_window.is_none()
        && response.rate_limit.secondary_window.is_none()
    {
        return Err("Codex returned no recognized usage windows".to_string());
    }

    let plan = response.plan_type;
    let primary = RateLimitSnapshot {
        limit_id: Some("codex".to_string()),
        limit_name: Some("Codex".to_string()),
        plan_type: plan.clone(),
        primary: response.rate_limit.primary_window.map(codex_window),
        secondary: response.rate_limit.secondary_window.map(codex_window),
    };
    let mut snapshots = HashMap::from([(
        "codex".to_string(),
        RateLimitSnapshot {
            limit_id: primary.limit_id.clone(),
            limit_name: primary.limit_name.clone(),
            plan_type: primary.plan_type.clone(),
            primary: primary.primary.as_ref().map(clone_window),
            secondary: primary.secondary.as_ref().map(clone_window),
        },
    )]);
    for additional in response.additional_rate_limits.unwrap_or_default() {
        let id = additional.metered_feature;
        snapshots.insert(
            id.clone(),
            RateLimitSnapshot {
                limit_id: Some(id),
                limit_name: additional.limit_name,
                plan_type: plan.clone(),
                primary: additional.rate_limit.primary_window.map(codex_window),
                secondary: additional.rate_limit.secondary_window.map(codex_window),
            },
        );
    }

    Ok(CodexUsage {
        rate_limits: primary,
        rate_limits_by_limit_id: snapshots,
    })
}

fn retry_error(provider: &str, retry_at: &OnceLock<Mutex<Option<Instant>>>) -> Option<String> {
    let remaining = retry_at
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()?
        .as_ref()?
        .saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return None;
    }
    Some(format!(
        "{provider} usage is temporarily limited. Try again in {}m.",
        remaining.as_secs().div_ceil(60)
    ))
}

fn set_retry_at(retry_at: &OnceLock<Mutex<Option<Instant>>>, retry_seconds: u64) {
    if let Ok(mut retry_at) = retry_at.get_or_init(|| Mutex::new(None)).lock() {
        *retry_at = Some(Instant::now() + Duration::from_secs(retry_seconds));
    }
}

#[tauri::command]
pub async fn get_codex_usage() -> Result<CodexUsage, String> {
    if let Some(error) = retry_error("Codex", &CODEX_RETRY_AT) {
        return Err(error);
    }
    let auth_path = dirs::home_dir()
        .ok_or("Home directory unavailable")?
        .join(".codex/auth.json");
    let auth: CodexAuth = fs::read_to_string(auth_path)
        .map_err(|_| "Sign in to Codex to see usage".to_string())
        .and_then(|value| {
            serde_json::from_str(&value).map_err(|_| "Codex credentials are invalid".to_string())
        })?;
    let response = reqwest::Client::new()
        .get(CODEX_USAGE_URL)
        .bearer_auth(&auth.tokens.access_token)
        .header("ChatGPT-Account-Id", &auth.tokens.account_id)
        .header("user-agent", "autopilot/0.1.0")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|error| format!("Could not read Codex usage: {error}"))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Codex sign-in expired. Sign in again and retry.".to_string());
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_seconds = retry_after_seconds(
            response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok()),
            SystemTime::now(),
        );
        set_retry_at(&CODEX_RETRY_AT, retry_seconds);
        return Err(format!(
            "Codex usage is temporarily limited. Try again in {}m.",
            retry_seconds.div_ceil(60)
        ));
    }
    if !response.status().is_success() {
        return Err(format!(
            "Codex usage request failed ({})",
            response.status()
        ));
    }
    let response = response
        .json()
        .await
        .map_err(|_| "Codex returned an invalid usage response")?;
    convert_codex_usage(response)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeOauth {
    access_token: String,
    subscription_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCredentials {
    claude_ai_oauth: ClaudeOauth,
}

fn read_claude_credentials() -> Result<ClaudeCredentials, String> {
    #[cfg(target_os = "macos")]
    if let Ok(output) = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
    {
        if output.status.success() {
            if let Ok(credentials) = serde_json::from_slice(&output.stdout) {
                return Ok(credentials);
            }
        }
    }

    let credentials_path = dirs::home_dir()
        .ok_or("Home directory unavailable")?
        .join(".claude/.credentials.json");
    fs::read_to_string(credentials_path)
        .map_err(|_| "Sign in to Claude Code to see usage".to_string())
        .and_then(|value| {
            serde_json::from_str(&value)
                .map_err(|_| "Claude Code credentials are invalid".to_string())
        })
}

#[derive(Deserialize)]
struct ClaudeUsageWindow {
    utilization: f64,
    resets_at: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeUsageResponse {
    five_hour: Option<ClaudeUsageWindow>,
    seven_day: Option<ClaudeUsageWindow>,
    seven_day_opus: Option<ClaudeUsageWindow>,
    seven_day_sonnet: Option<ClaudeUsageWindow>,
}

impl ClaudeUsageResponse {
    fn has_usage_window(&self) -> bool {
        self.five_hour.is_some()
            || self.seven_day.is_some()
            || self.seven_day_opus.is_some()
            || self.seven_day_sonnet.is_some()
    }
}

fn claude_window(window: ClaudeUsageWindow, duration_minutes: u64) -> RateLimitWindow {
    RateLimitWindow {
        used_percent: window.utilization.clamp(0.0, 100.0),
        window_duration_mins: Some(duration_minutes),
        resets_at: window
            .resets_at
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
            .map(|value| value.timestamp()),
    }
}

fn retry_after_seconds(value: Option<&str>, now: SystemTime) -> u64 {
    value
        .and_then(|value| {
            value.parse::<u64>().ok().or_else(|| {
                httpdate::parse_http_date(value)
                    .ok()
                    .map(|retry_at| retry_at.duration_since(now).unwrap_or_default().as_secs())
            })
        })
        .unwrap_or(300)
}

#[tauri::command]
pub async fn get_claude_usage() -> Result<CodexUsage, String> {
    if let Some(error) = retry_error("Claude", &CLAUDE_RETRY_AT) {
        return Err(error);
    }
    let credentials = read_claude_credentials()?;
    if credentials.claude_ai_oauth.access_token.is_empty() {
        return Err("Sign in to Claude Code to see usage".to_string());
    }

    let response = reqwest::Client::new()
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(&credentials.claude_ai_oauth.access_token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("user-agent", "autopilot/0.1.0")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|error| format!("Could not read Claude usage: {error}"))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Claude Code sign-in expired. Run `claude auth login`.".to_string());
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_seconds = retry_after_seconds(
            response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok()),
            SystemTime::now(),
        );
        set_retry_at(&CLAUDE_RETRY_AT, retry_seconds);
        return Err(format!(
            "Claude usage is temporarily limited. Try again in {}m.",
            retry_seconds.div_ceil(60)
        ));
    }
    if !response.status().is_success() {
        return Err(format!(
            "Claude usage request failed ({})",
            response.status()
        ));
    }
    let response: ClaudeUsageResponse = response
        .json()
        .await
        .map_err(|_| "Claude returned an invalid usage response")?;
    if !response.has_usage_window() {
        return Err("Claude returned no recognized usage windows".to_string());
    }

    let plan = credentials.claude_ai_oauth.subscription_type;
    let primary = RateLimitSnapshot {
        limit_id: Some("claude".to_string()),
        limit_name: Some("Claude".to_string()),
        plan_type: plan.clone(),
        primary: response.five_hour.map(|window| claude_window(window, 300)),
        secondary: response
            .seven_day
            .map(|window| claude_window(window, 10_080)),
    };
    let mut snapshots = HashMap::from([(
        "claude".to_string(),
        RateLimitSnapshot {
            limit_id: primary.limit_id.clone(),
            limit_name: primary.limit_name.clone(),
            plan_type: primary.plan_type.clone(),
            primary: primary.primary.as_ref().map(clone_window),
            secondary: primary.secondary.as_ref().map(clone_window),
        },
    )]);
    for (id, name, window) in [
        ("claude_opus", "Claude Opus", response.seven_day_opus),
        ("claude_sonnet", "Claude Sonnet", response.seven_day_sonnet),
    ] {
        if let Some(window) = window {
            snapshots.insert(
                id.to_string(),
                RateLimitSnapshot {
                    limit_id: Some(id.to_string()),
                    limit_name: Some(name.to_string()),
                    plan_type: plan.clone(),
                    primary: Some(claude_window(window, 10_080)),
                    secondary: None,
                },
            );
        }
    }

    Ok(CodexUsage {
        rate_limits: primary,
        rate_limits_by_limit_id: snapshots,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_codex_api_usage() {
        let response: CodexApiUsage = serde_json::from_str(
            r#"{"plan_type":"pro","rate_limit":{"primary_window":{"used_percent":28.0,"limit_window_seconds":604800,"reset_at":1789818655},"secondary_window":null},"additional_rate_limits":null}"#,
        )
        .unwrap();

        let usage = convert_codex_usage(response).unwrap();
        let window = usage.rate_limits.primary.unwrap();
        assert_eq!(window.used_percent, 28.0);
        assert_eq!(window.window_duration_mins, Some(10_080));
        assert_eq!(usage.rate_limits.plan_type.as_deref(), Some("pro"));
    }

    #[test]
    fn converts_claude_usage_and_reset_time() {
        let window = claude_window(
            ClaudeUsageWindow {
                utilization: 42.5,
                resets_at: Some("2026-09-17T01:00:00Z".to_string()),
            },
            300,
        );

        assert_eq!(window.used_percent, 42.5);
        assert_eq!(window.window_duration_mins, Some(300));
        assert_eq!(window.resets_at, Some(1_789_606_800));
    }

    #[test]
    fn parses_retry_after_seconds_and_http_dates() {
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000);

        assert_eq!(retry_after_seconds(Some("120"), now), 120);
        assert_eq!(
            retry_after_seconds(
                Some(&httpdate::fmt_http_date(now + Duration::from_secs(90))),
                now
            ),
            90
        );
        assert_eq!(
            retry_after_seconds(
                Some(&httpdate::fmt_http_date(now - Duration::from_secs(1))),
                now
            ),
            0
        );
        assert_eq!(retry_after_seconds(Some("invalid"), now), 300);
    }

    #[test]
    fn suppresses_requests_until_retry_deadline() {
        let retry_at = OnceLock::new();

        set_retry_at(&retry_at, 120);

        assert_eq!(
            retry_error("Codex", &retry_at).as_deref(),
            Some("Codex usage is temporarily limited. Try again in 2m.")
        );
    }

    #[test]
    fn rejects_claude_responses_without_usage_windows() {
        let empty: ClaudeUsageResponse = serde_json::from_str("{}").unwrap();
        let populated: ClaudeUsageResponse =
            serde_json::from_str(r#"{"five_hour":{"utilization":0.0,"resets_at":null}}"#).unwrap();

        assert!(!empty.has_usage_window());
        assert!(populated.has_usage_window());
    }
}
