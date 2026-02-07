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

    let json = serde_json::to_string(credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    #[cfg(unix)]
    {
        use std::fs::OpenOptions;
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .map_err(|e| format!("Failed to create credentials file: {}", e))?;

        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write credentials file: {}", e))?;
    }

    #[cfg(not(unix))]
    {
        fs::write(&path, &json).map_err(|e| format!("Failed to write credentials file: {}", e))?;
    }

    Ok(())
}

fn get_from_file() -> Result<Option<StoredCredentials>, String> {
    let path = match get_credentials_path() {
        Some(p) => p,
        None => return Ok(None),
    };

    if !path.exists() {
        return Ok(None);
    }

    let json =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read credentials file: {}", e))?;

    let creds: StoredCredentials = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse credentials file: {}", e))?;

    Ok(Some(creds))
}

fn delete_from_file() -> Result<(), String> {
    if let Some(path) = get_credentials_path() {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete credentials file: {}", e))?;
        }
    }
    Ok(())
}

pub fn store_credentials(credentials: &StoredCredentials) -> Result<(), String> {
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
