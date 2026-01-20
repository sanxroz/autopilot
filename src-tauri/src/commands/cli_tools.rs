use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

static CLI_TOOL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

const COMMON_PATHS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/local/bin",
];

pub fn find_cli_tool(name: &str) -> Result<String, String> {
    let cache = CLI_TOOL_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    {
        let cache_guard = cache.lock();
        if let Some(path) = cache_guard.get(name) {
            return Ok(path.clone());
        }
    }

    for base_path in COMMON_PATHS {
        let full_path = format!("{}/{}", base_path, name);
        if Path::new(&full_path).exists() && is_executable(&full_path) {
            cache.lock().insert(name.to_string(), full_path.clone());
            return Ok(full_path);
        }
    }

    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                cache.lock().insert(name.to_string(), path.clone());
                return Ok(path);
            }
        }
    }

    if let Some(path) = try_shell_which(name) {
        cache.lock().insert(name.to_string(), path.clone());
        return Ok(path);
    }

    Err(format!(
        "{} CLI not found. Please ensure {} is installed.\n\
         Expected locations:\n\
         - /opt/homebrew/bin/{} (Homebrew on Apple Silicon)\n\
         - /usr/local/bin/{} (Homebrew on Intel)\n\
         Install with: brew install {}",
        name, name, name, name, name
    ))
}

fn is_executable(path: &str) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            let permissions = metadata.permissions();
            return permissions.mode() & 0o111 != 0;
        }
    }
    #[cfg(not(unix))]
    {
        return Path::new(path).exists();
    }
    false
}

fn try_shell_which(name: &str) -> Option<String> {
    let shells = ["/bin/zsh", "/bin/bash", "/bin/sh"];

    for shell in shells {
        if !Path::new(shell).exists() {
            continue;
        }

        let result = Command::new(shell)
            .args(["-l", "-c", &format!("which {}", name)])
            .output();

        if let Ok(output) = result {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && Path::new(&path).exists() {
                    return Some(path);
                }
            }
        }
    }

    None
}

#[allow(dead_code)]
pub fn clear_cache() {
    if let Some(cache) = CLI_TOOL_CACHE.get() {
        cache.lock().clear();
    }
}

#[allow(dead_code)]
pub fn get_cached_path(name: &str) -> Option<String> {
    CLI_TOOL_CACHE
        .get()
        .and_then(|cache| cache.lock().get(name).cloned())
}
