use super::secure_storage::{self, StoredCredentials};
use serde::{Deserialize, Serialize};

const GITHUB_CLIENT_ID: &str = "Ov23litgf1sQFYKmeg7g";

const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL: &str = "https://api.github.com/user";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceFlowResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthStatus {
    pub authenticated: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubUser {
    pub login: String,
    pub avatar_url: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeApiResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenApiResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[tauri::command]
pub async fn oauth_start_device_flow() -> Result<DeviceFlowResponse, String> {
    let client = reqwest::Client::new();

    let response = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("scope", "repo read:user workflow"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to start device flow: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, text));
    }

    let api_response: DeviceCodeApiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse device code response: {}", e))?;

    Ok(DeviceFlowResponse {
        device_code: api_response.device_code,
        user_code: api_response.user_code,
        verification_uri: api_response.verification_uri,
        expires_in: api_response.expires_in,
        interval: api_response.interval,
    })
}

#[tauri::command]
pub async fn oauth_poll_for_token(device_code: String) -> Result<OAuthStatus, String> {
    let client = reqwest::Client::new();

    let response = client
        .post(GITHUB_ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to poll for token: {}", e))?;

    let status_code = response.status();
    let response_text = response.text().await.unwrap_or_default();
    
    println!("[OAuth] Poll response status: {}", status_code);
    println!("[OAuth] Poll response body: {}", response_text);

    if !status_code.is_success() {
        return Err(format!("GitHub API error ({}): {}", status_code, response_text));
    }

    let token_response: TokenApiResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse token response: {} - body: {}", e, response_text))?;

    if let Some(error) = token_response.error {
        match error.as_str() {
            "authorization_pending" => {
                return Err("authorization_pending".to_string());
            }
            "slow_down" => {
                return Err("slow_down".to_string());
            }
            "expired_token" => {
                return Err("Device code expired. Please restart the login process.".to_string());
            }
            "access_denied" => {
                return Err("Access denied by user.".to_string());
            }
            _ => {
                return Err(format!(
                    "OAuth error: {} - {}",
                    error,
                    token_response.error_description.unwrap_or_default()
                ));
            }
        }
    }

    let access_token = token_response
        .access_token
        .ok_or("No access token in response")?;

    println!("[OAuth] Got access token, fetching user info...");
    let user = fetch_github_user(&access_token).await?;
    println!("[OAuth] User: {}", user.login);

    let credentials = StoredCredentials {
        access_token,
        username: user.login.clone(),
        avatar_url: Some(user.avatar_url.clone()),
    };
    
    match secure_storage::store_credentials(&credentials) {
        Ok(()) => println!("[OAuth] Credentials stored successfully"),
        Err(e) => {
            println!("[OAuth] Failed to store credentials: {}", e);
            return Err(format!("Failed to store credentials: {}", e));
        }
    }

    if let Err(e) = configure_git_credential_helper(&credentials.username, &credentials.access_token) {
        println!("[OAuth] Warning: Failed to configure git credentials: {}", e);
    }

    

    Ok(OAuthStatus {
        authenticated: true,
        username: Some(user.login),
        avatar_url: Some(user.avatar_url),
    })
}

async fn fetch_github_user(token: &str) -> Result<GitHubUser, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(GITHUB_API_USER_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "Autopilot-Desktop")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, text));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse user response: {}", e))
}

fn configure_git_credential_helper(username: &str, token: &str) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut child = Command::new("git")
        .args(["credential", "approve"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to run git credential approve: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        writeln!(stdin, "protocol=https").ok();
        writeln!(stdin, "host=github.com").ok();
        writeln!(stdin, "username={}", username).ok();
        writeln!(stdin, "password={}", token).ok();
        writeln!(stdin).ok();
    }

    child
        .wait()
        .map_err(|e| format!("git credential approve failed: {}", e))?;

    Ok(())
}



#[tauri::command]
pub async fn oauth_get_status() -> Result<OAuthStatus, String> {
    println!("[OAuth] Checking for stored credentials...");
    
    let creds = match secure_storage::get_credentials() {
        Ok(Some(c)) => {
            println!("[OAuth] Found stored credentials for user: {}", c.username);
            c
        }
        Ok(None) => {
            println!("[OAuth] No stored credentials found");
            return Ok(OAuthStatus {
                authenticated: false,
                username: None,
                avatar_url: None,
            });
        }
        Err(e) => {
            println!("[OAuth] Error reading credentials: {}", e);
            return Ok(OAuthStatus {
                authenticated: false,
                username: None,
                avatar_url: None,
            });
        }
    };

    let client = reqwest::Client::new();
    let response = client
        .get(GITHUB_API_USER_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "Autopilot-Desktop")
        .header("Authorization", format!("Bearer {}", creds.access_token))
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            println!("[OAuth] Token is valid");
            Ok(OAuthStatus {
                authenticated: true,
                username: Some(creds.username),
                avatar_url: creds.avatar_url,
            })
        }
        Ok(resp) if resp.status() == 401 => {
            println!("[OAuth] Token is invalid (401), clearing credentials");
            let _ = secure_storage::delete_credentials();
            Ok(OAuthStatus {
                authenticated: false,
                username: None,
                avatar_url: None,
            })
        }
        Ok(resp) => {
            println!("[OAuth] API returned status {}, assuming token valid", resp.status());
            Ok(OAuthStatus {
                authenticated: true,
                username: Some(creds.username),
                avatar_url: creds.avatar_url,
            })
        }
        Err(e) => {
            println!("[OAuth] Network error checking token: {}, assuming valid", e);
            Ok(OAuthStatus {
                authenticated: true,
                username: Some(creds.username),
                avatar_url: creds.avatar_url,
            })
        }
    }
}

#[tauri::command]
pub async fn oauth_logout() -> Result<(), String> {
    secure_storage::delete_credentials()?;

    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut child = Command::new("git")
        .args(["credential", "reject"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok();

    if let Some(ref mut process) = child {
        if let Some(ref mut stdin) = process.stdin {
            writeln!(stdin, "protocol=https").ok();
            writeln!(stdin, "host=github.com").ok();
            writeln!(stdin).ok();
        }
        process.wait().ok();
    }

    Ok(())
}

#[tauri::command]
pub fn oauth_get_token() -> Result<Option<String>, String> {
    secure_storage::get_token()
}


