//! Per-project GitHub accounts: the repo's owner picks which logged-in `gh`
//! account (token + git identity) its `gh`/`git` commands run as.
use super::cli_tools::find_cli_tool;
use super::github::parse_github_owner_repo;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Instant, SystemTime};

const TOKEN_TTL_SECS: u64 = 300;
const FAILURE_TTL_SECS: u64 = 10;
/// `gh` ignores an empty `GH_TOKEN`, so an unavailable mapped account gets a token it rejects.
const UNAVAILABLE_TOKEN: &str = "autopilot-github-account-unavailable";

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

/// `~/.config/autopilot/github-accounts.json`
#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct GithubAccountsConfig {
    /// `gh` account for repos whose owner has no entry in `owners`.
    #[serde(default)]
    pub default: Option<String>,
    /// repo owner (user/org) -> `gh` account
    #[serde(default)]
    pub owners: HashMap<String, String>,
    /// `gh` account -> commit author used in Autopilot terminals
    #[serde(default)]
    pub identities: HashMap<String, GitIdentity>,
}

#[derive(Clone)]
struct Resolved {
    /// Empty when the explicitly mapped account has no usable token.
    token: String,
    /// The owner is mapped to this account, as opposed to falling back to `default`.
    explicit: bool,
    identity: Option<GitIdentity>,
}

impl Resolved {
    fn gh_token(&self) -> &str {
        if self.token.is_empty() {
            UNAVAILABLE_TOKEN
        } else {
            &self.token
        }
    }
}

#[derive(Default)]
struct Cache {
    /// Bumped whenever the entries are cleared, so a lookup that started before
    /// the clear cannot cache its stale result afterwards.
    generation: u64,
    config_mtime: Option<SystemTime>,
    entries: HashMap<String, (Instant, Option<Resolved>)>,
}

static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();

fn cache() -> &'static Mutex<Cache> {
    CACHE.get_or_init(Default::default)
}

fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(Path::new(&home).join(".config/autopilot/github-accounts.json"))
}

fn load_config() -> GithubAccountsConfig {
    let mut config: GithubAccountsConfig = config_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    lowercase_owners(&mut config);
    config
}

/// Owner names are case-insensitive; lookups use lowercase keys.
fn lowercase_owners(config: &mut GithubAccountsConfig) {
    config.owners = std::mem::take(&mut config.owners)
        .into_iter()
        .map(|(owner, account)| (owner.to_ascii_lowercase(), account))
        .collect();
}

fn resolve_uncached(dir: &str) -> Option<Resolved> {
    let config = load_config();
    // An empty dir is a call with no repo (notifications, assigned issues):
    // use the default account. A dir that isn't a GitHub repo keeps `gh`'s own.
    let (account, explicit) = if dir.is_empty() {
        (config.default.clone()?, false)
    } else {
        let (owner, _) = parse_github_owner_repo(dir)?;
        match config.owners.get(&owner.to_ascii_lowercase()) {
            Some(account) => (account.clone(), true),
            None => (config.default.clone()?, false),
        }
    };
    let token = find_cli_tool("gh")
        .ok()
        .and_then(|gh| {
            Command::new(gh)
                .args([
                    "auth",
                    "token",
                    "--hostname",
                    "github.com",
                    "--user",
                    &account,
                ])
                .output()
                .ok()
        })
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|token| token.trim().to_string())
        .unwrap_or_default();
    if token.is_empty() {
        eprintln!("[autopilot] warning: no gh token for account {account}");
        // A mapped account must not silently fall back to another login.
        return explicit.then(|| Resolved {
            token,
            explicit,
            identity: None,
        });
    }
    Some(Resolved {
        token,
        explicit,
        identity: config.identities.get(&account).cloned(),
    })
}

fn resolve(dir: &str) -> Option<Resolved> {
    let mtime = config_path()
        .and_then(|p| std::fs::metadata(p).ok())
        .and_then(|m| m.modified().ok());
    let generation = {
        let mut cache = cache().lock();
        if cache.config_mtime != mtime {
            cache.entries.clear();
            cache.generation += 1;
            cache.config_mtime = mtime;
        }
        if let Some((at, hit)) = cache.entries.get(dir) {
            let ttl = if hit.as_ref().is_some_and(|r| !r.token.is_empty()) {
                TOKEN_TTL_SECS
            } else {
                FAILURE_TTL_SECS
            };
            if at.elapsed().as_secs() < ttl {
                return hit.clone();
            }
        }
        cache.generation
    };
    let resolved = resolve_uncached(dir);
    let mut cache = cache().lock();
    if cache.generation == generation {
        cache
            .entries
            .insert(dir.to_string(), (Instant::now(), resolved.clone()));
    }
    resolved
}

/// Env vars for a terminal in `dir`. The token is handed to terminals (and every
/// agent or script in them) only for projects explicitly mapped to an account;
/// the default account never leaks into arbitrary repos.
pub fn account_env(dir: &str) -> Vec<(&'static str, String)> {
    let Some(resolved) = resolve(dir) else {
        return Vec::new();
    };
    let mut env = Vec::new();
    if resolved.explicit {
        env.push(("GH_TOKEN", resolved.gh_token().to_string()));
    }
    if let Some(id) = resolved.identity.filter(|_| resolved.explicit) {
        env.push(("GIT_AUTHOR_NAME", id.name.clone()));
        env.push(("GIT_COMMITTER_NAME", id.name));
        env.push(("GIT_AUTHOR_EMAIL", id.email.clone()));
        env.push(("GIT_COMMITTER_EMAIL", id.email));
    }
    env
}

pub trait GhAccountDir {
    /// Like `current_dir`, plus `GH_TOKEN` for the account that owns `dir`.
    fn gh_dir(&mut self, dir: impl AsRef<Path>) -> &mut Self;
    /// `GH_TOKEN` for the default account, for calls that have no repo.
    fn gh_default(&mut self) -> &mut Self;
}

impl GhAccountDir for Command {
    fn gh_dir(&mut self, dir: impl AsRef<Path>) -> &mut Self {
        let dir = dir.as_ref();
        if let Some(resolved) = resolve(&dir.to_string_lossy()) {
            self.env("GH_TOKEN", resolved.gh_token());
        }
        self.current_dir(dir)
    }

    fn gh_default(&mut self) -> &mut Self {
        if let Some(resolved) = resolve("") {
            self.env("GH_TOKEN", resolved.gh_token());
        }
        self
    }
}

#[tauri::command]
pub fn get_github_accounts() -> GithubAccountsConfig {
    load_config()
}

#[tauri::command]
pub fn set_github_accounts(config: GithubAccountsConfig) -> Result<(), String> {
    let path = config_path().ok_or("HOME is not set")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    // Rename into place so concurrent readers never see a half-written file.
    // The temp file is unique so overlapping saves can't clobber each other.
    let parent = path.parent().ok_or("Configuration path has no parent")?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    tmp.persist(&path).map_err(|e| e.error.to_string())?;
    let mut cache = cache().lock();
    cache.entries.clear();
    cache.generation += 1;
    Ok(())
}

/// GitHub owner of each repo's `origin`, in the order given. Lowercased: owner
/// names are case-insensitive and are the keys of `owners`.
#[tauri::command(async)]
pub fn get_repo_owners(repo_paths: Vec<String>) -> Vec<Option<String>> {
    repo_paths
        .iter()
        .map(|path| parse_github_owner_repo(path).map(|(owner, _)| owner.to_ascii_lowercase()))
        .collect()
}

/// Logins `gh` is signed in with on github.com.
#[tauri::command(async)]
pub fn list_gh_accounts() -> Result<Vec<String>, String> {
    let gh = find_cli_tool("gh")?;
    let output = Command::new(gh)
        .args(["auth", "status", "--json", "hosts"])
        .output()
        .map_err(|e| format!("Failed to run gh auth status: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Unexpected gh output: {e}"))?;
    Ok(json["hosts"]["github.com"]
        .as_array()
        .map(|accounts| {
            accounts
                .iter()
                .filter_map(|a| a["login"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_parses_partial_json() {
        let c: GithubAccountsConfig =
            serde_json::from_str(r#"{"owners":{"north-code":"santiago-cohere"}}"#).unwrap();
        assert_eq!(c.owners["north-code"], "santiago-cohere");
        assert!(c.default.is_none());
    }

    #[test]
    fn owner_keys_are_lowercased() {
        let mut c: GithubAccountsConfig =
            serde_json::from_str(r#"{"owners":{"Acme":"alice"}}"#).unwrap();
        lowercase_owners(&mut c);
        assert_eq!(c.owners["acme"], "alice");
    }

    #[test]
    fn unavailable_mapped_account_gets_a_rejected_token() {
        let r = Resolved {
            token: String::new(),
            explicit: true,
            identity: None,
        };
        assert_eq!(r.gh_token(), UNAVAILABLE_TOKEN);
    }

    fn login_for(dir: Option<&str>) -> String {
        let mut cmd = Command::new(find_cli_tool("gh").unwrap());
        cmd.args(["api", "user", "-q", ".login"]);
        match dir {
            Some(dir) => cmd.gh_dir(dir),
            None => cmd.gh_default(),
        };
        String::from_utf8_lossy(&cmd.output().unwrap().stdout)
            .trim()
            .to_string()
    }

    #[test]
    #[ignore = "needs gh logins for sanxroz and santiago-cohere, and a mrge-io checkout"]
    fn real_accounts_end_to_end() {
        let path = config_path().unwrap();
        let backup = std::fs::read_to_string(&path).ok();
        let cubic = format!("{}/Documents/cubic", std::env::var("HOME").unwrap());
        let here = env!("CARGO_MANIFEST_DIR");

        let accounts = list_gh_accounts().unwrap();
        assert!(
            accounts.contains(&"sanxroz".to_string())
                && accounts.contains(&"santiago-cohere".to_string())
        );
        assert_eq!(
            get_repo_owners(vec![here.into(), cubic.clone(), "/tmp".into()]),
            vec![Some("sanxroz".into()), Some("mrge-io".into()), None]
        );

        let mut config = GithubAccountsConfig {
            default: Some("sanxroz".into()),
            owners: [("mrge-io".to_string(), "santiago-cohere".to_string())].into(),
            ..Default::default()
        };
        config.identities.insert(
            "santiago-cohere".into(),
            GitIdentity {
                name: "N".into(),
                email: "n@x.dev".into(),
            },
        );
        set_github_accounts(config.clone()).unwrap();

        assert_eq!(
            login_for(Some(here)),
            "sanxroz",
            "unmapped owner -> default"
        );
        assert_eq!(login_for(Some(&cubic)), "santiago-cohere", "mapped owner");
        assert_eq!(login_for(None), "sanxroz", "no repo -> default");
        assert!(
            account_env("/tmp").is_empty(),
            "non-repo keeps gh's account"
        );
        let env = account_env(&cubic);
        assert!(env.iter().any(|(k, v)| *k == "GH_TOKEN" && !v.is_empty()));
        assert!(env.contains(&("GIT_AUTHOR_EMAIL", "n@x.dev".to_string())));
        assert!(
            account_env(here).is_empty(),
            "default account: no token, no identity in terminals"
        );

        // Editing the file directly (not via set_github_accounts) must be picked up.
        config.owners.insert("mrge-io".into(), "sanxroz".into());
        std::thread::sleep(std::time::Duration::from_millis(1100));
        std::fs::write(&path, serde_json::to_string(&config).unwrap()).unwrap();
        assert_eq!(
            login_for(Some(&cubic)),
            "sanxroz",
            "file edit invalidates cache"
        );

        match backup {
            Some(b) => std::fs::write(&path, b).unwrap(),
            None => std::fs::remove_file(&path).unwrap(),
        }
    }
}
