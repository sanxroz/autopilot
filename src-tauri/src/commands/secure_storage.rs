use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const CREDENTIALS_FILE: &str = ".autopilot-oauth.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredCredentials {
    pub access_token: String,
    pub username: String,
    pub avatar_url: Option<String>,
}

fn get_credentials_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(CREDENTIALS_FILE))
}

fn store_to_file(credentials: &StoredCredentials) -> Result<(), String> {
    let path = get_credentials_path().ok_or("Could not determine home directory")?;
    println!("[OAuth] Writing credentials to: {:?}", path);

    let json = serde_json::to_string(credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    fs::write(&path, &json).map_err(|e| {
        println!("[OAuth] Failed to write file: {}", e);
        format!("Failed to write credentials file: {}", e)
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }

    println!("[OAuth] Credentials saved successfully");
    Ok(())
}

fn get_from_file() -> Result<Option<StoredCredentials>, String> {
    let path = match get_credentials_path() {
        Some(p) => p,
        None => {
            println!("[OAuth] Could not determine home directory");
            return Ok(None);
        }
    };

    println!("[OAuth] Looking for credentials at: {:?}", path);

    if !path.exists() {
        println!("[OAuth] Credentials file does not exist");
        return Ok(None);
    }

    let json = fs::read_to_string(&path).map_err(|e| {
        println!("[OAuth] Failed to read file: {}", e);
        format!("Failed to read credentials file: {}", e)
    })?;

    let creds: StoredCredentials = serde_json::from_str(&json).map_err(|e| {
        println!("[OAuth] Failed to parse file: {}", e);
        format!("Failed to parse credentials file: {}", e)
    })?;

    println!("[OAuth] Credentials loaded for user: {}", creds.username);
    Ok(Some(creds))
}

fn delete_from_file() -> Result<(), String> {
    if let Some(path) = get_credentials_path() {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete credentials file: {}", e))?;
            println!("[OAuth] Credentials deleted");
        }
    }
    Ok(())
}

pub fn store_credentials(credentials: &StoredCredentials) -> Result<(), String> {
    println!(
        "[OAuth] Attempting to store credentials for user: {}",
        credentials.username
    );
    store_to_file(credentials)
}

pub fn get_credentials() -> Result<Option<StoredCredentials>, String> {
    get_from_file()
}

pub fn get_token() -> Result<Option<String>, String> {
    match get_credentials()? {
        Some(creds) => Ok(Some(creds.access_token)),
        None => Ok(None),
    }
}

pub fn delete_credentials() -> Result<(), String> {
    delete_from_file()
}
