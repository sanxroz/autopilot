use parking_lot::Mutex;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

static CLI_TOOL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static SEARCH_PATHS: OnceLock<Vec<String>> = OnceLock::new();

const SYSTEM_PATHS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/local/bin",
];

const HOME_RELATIVE_PATHS: &[&str] = &[
    ".local/bin",
    ".cargo/bin",
    ".deno/bin",
    ".bun/bin",
    "go/bin",
    ".fly/bin",
];

fn parse_node_version(path: &Path) -> Option<(u32, u32, u32)> {
    let name = path.file_name()?.to_str()?;
    let version_str = name.strip_prefix('v')?;
    let parts: Vec<&str> = version_str.split('.').collect();
    if parts.len() >= 3 {
        Some((
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].parse().ok()?,
        ))
    } else {
        None
    }
}

fn compare_node_versions(a: &PathBuf, b: &PathBuf) -> Ordering {
    match (parse_node_version(a), parse_node_version(b)) {
        (Some(va), Some(vb)) => vb.cmp(&va),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => b.cmp(a),
    }
}

fn get_search_paths() -> &'static Vec<String> {
    SEARCH_PATHS.get_or_init(|| {
        let mut paths = Vec::new();

        if let Some(home) = std::env::var_os("HOME").map(|h| h.to_string_lossy().to_string()) {
            for rel_path in HOME_RELATIVE_PATHS {
                paths.push(format!("{}/{}", home, rel_path));
            }

            let nvm_dir = format!("{}/.nvm/versions/node", home);
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                let mut versions: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .map(|e| e.path())
                    .collect();
                versions.sort_by(compare_node_versions);

                let default_alias = format!("{}/.nvm/alias/default", home);
                if let Ok(default_version) = std::fs::read_to_string(&default_alias) {
                    let default_version = default_version.trim();
                    if let Some(matching) = versions.iter().find(|v| {
                        v.file_name()
                            .map(|n| n.to_string_lossy().contains(default_version))
                            .unwrap_or(false)
                    }) {
                        paths.push(format!("{}/bin", matching.display()));
                    }
                }

                for version_path in versions.iter().take(3) {
                    let bin_path = format!("{}/bin", version_path.display());
                    if !paths.contains(&bin_path) {
                        paths.push(bin_path);
                    }
                }
            }

            let fnm_dir = format!("{}/.local/share/fnm/node-versions", home);
            if let Ok(entries) = std::fs::read_dir(&fnm_dir) {
                let mut versions: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .map(|e| e.path())
                    .collect();
                versions.sort_by(compare_node_versions);

                for version_path in versions.iter().take(3) {
                    let bin_path = format!("{}/installation/bin", version_path.display());
                    if Path::new(&bin_path).exists() && !paths.contains(&bin_path) {
                        paths.push(bin_path);
                    }
                }
            }

            let npm_global = format!("{}/.npm-global/bin", home);
            if Path::new(&npm_global).exists() {
                paths.push(npm_global);
            }

            let pnpm_home =
                std::env::var("PNPM_HOME").unwrap_or_else(|_| format!("{}/Library/pnpm", home));
            if Path::new(&pnpm_home).exists() {
                paths.push(pnpm_home);
            }

            let yarn_global = format!("{}/.yarn/bin", home);
            if Path::new(&yarn_global).exists() {
                paths.push(yarn_global);
            }

            let pipx_bin = format!("{}/.local/pipx/bin", home);
            if Path::new(&pipx_bin).exists() {
                paths.push(pipx_bin);
            }
        }

        for sys_path in SYSTEM_PATHS {
            paths.push(sys_path.to_string());
        }

        paths
    })
}

pub fn find_cli_tool(name: &str) -> Result<String, String> {
    let cache = CLI_TOOL_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    {
        let cache_guard = cache.lock();
        if let Some(path) = cache_guard.get(name) {
            return Ok(path.clone());
        }
    }

    for base_path in get_search_paths() {
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

    let home_hint = std::env::var("HOME").unwrap_or_else(|_| "~".to_string());
    Err(format!(
        "{} CLI not found. Please ensure {} is installed and in your PATH.\n\
         Searched locations:\n\
         - {}/.local/bin/{}\n\
         - {}/.cargo/bin/{}\n\
         - /opt/homebrew/bin/{} (Homebrew on Apple Silicon)\n\
         - /usr/local/bin/{} (Homebrew on Intel)\n\
         - nvm/fnm managed Node.js paths\n\n\
         Common install methods:\n\
         - bun add -g {}\n\
         - npm install -g {}\n\
         - brew install {}",
        name, name, home_hint, name, home_hint, name, name, name, name, name, name
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_cli_tool_git_exists() {
        // git should always be available
        let result = find_cli_tool("git");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.contains("git"));
    }

    #[test]
    fn test_find_cli_tool_not_found() {
        let result = find_cli_tool("nonexistent_tool_xyz_12345");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("not found"));
        assert!(err.contains("nonexistent_tool_xyz_12345"));
    }

    #[test]
    fn test_get_cached_path_uncached() {
        let result = get_cached_path("totally_uncached_tool_99999");
        assert!(result.is_none());
    }

    #[test]
    #[serial_test::serial]
    fn test_cache_behavior() {
        clear_cache();
        // Find git (populates cache)
        let path = find_cli_tool("git").unwrap();
        // Should be cached now
        let cached = get_cached_path("git");
        assert!(cached.is_some());
        assert_eq!(cached.unwrap(), path);
    }

    #[test]
    #[serial_test::serial]
    fn test_clear_cache() {
        clear_cache();
        // Ensure something is cached
        let _ = find_cli_tool("git");
        assert!(get_cached_path("git").is_some());

        clear_cache();
        assert!(get_cached_path("git").is_none());
    }

    #[test]
    fn test_is_executable_nonexistent() {
        assert!(!is_executable("/nonexistent/path/to/binary"));
    }

    #[test]
    fn test_parse_node_version_valid() {
        let path = PathBuf::from("/nvm/versions/node/v18.17.1");
        let version = parse_node_version(&path);
        assert_eq!(version, Some((18, 17, 1)));
    }

    #[test]
    fn test_parse_node_version_no_prefix() {
        let path = PathBuf::from("/nvm/versions/node/18.17.1");
        let version = parse_node_version(&path);
        assert_eq!(version, None); // requires 'v' prefix
    }

    #[test]
    fn test_parse_node_version_invalid() {
        let path = PathBuf::from("/nvm/versions/node/not-a-version");
        let version = parse_node_version(&path);
        assert_eq!(version, None);
    }

    #[test]
    fn test_compare_node_versions() {
        let a = PathBuf::from("/node/v18.17.1");
        let b = PathBuf::from("/node/v20.0.0");
        // Higher version should come first (descending order)
        let ord = compare_node_versions(&a, &b);
        assert_eq!(ord, Ordering::Greater); // b (v20) > a (v18), so a comes after
    }
}
