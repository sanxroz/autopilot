use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResource {
    kind: &'static str,
    name: String,
    path: String,
    scope: String,
}

fn push_resource(
    resources: &mut Vec<SettingsResource>,
    seen: &mut HashSet<(String, String, String)>,
    kind: &'static str,
    name: String,
    path: &Path,
    scope: &str,
) {
    let path = path.to_string_lossy().into_owned();
    if seen.insert((kind.to_string(), name.clone(), path.clone())) {
        resources.push(SettingsResource {
            kind,
            name,
            path,
            scope: scope.to_string(),
        });
    }
}

fn scan_named_files(
    resources: &mut Vec<SettingsResource>,
    seen: &mut HashSet<(String, String, String)>,
    root: &Path,
    scope: &str,
) -> Result<(), String> {
    for prefix in [".agents", ".codex", ".claude"] {
        let base = root.join(prefix);
        let skills = base.join("skills");
        match fs::read_dir(&skills) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry
                        .map_err(|error| format!("Failed to read {}: {error}", skills.display()))?;
                    let manifest = entry.path().join("SKILL.md");
                    if manifest.is_file() {
                        push_resource(
                            resources,
                            seen,
                            "skill",
                            entry.file_name().to_string_lossy().into_owned(),
                            &manifest,
                            scope,
                        );
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Failed to read {}: {error}", skills.display())),
        }

        let agents = base.join("agents");
        match fs::read_dir(&agents) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry
                        .map_err(|error| format!("Failed to read {}: {error}", agents.display()))?;
                    let path = entry.path();
                    let extension = path.extension().and_then(|value| value.to_str());
                    if path.is_file() && matches!(extension, Some("md" | "toml")) {
                        let name = path
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned();
                        push_resource(resources, seen, "agent", name, &path, scope);
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Failed to read {}: {error}", agents.display())),
        }
    }
    Ok(())
}

fn parse_mcp_names(path: &Path) -> Result<Vec<String>, String> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Failed to read {}: {error}", path.display())),
    };

    if path.extension().and_then(|value| value.to_str()) == Some("json") {
        let value = serde_json::from_str::<serde_json::Value>(&contents)
            .map_err(|error| format!("Failed to parse {}: {error}", path.display()))?;
        return Ok(value
            .get("mcpServers")
            .and_then(|servers| servers.as_object())
            .map(|servers| servers.keys().cloned().collect())
            .unwrap_or_default());
    }

    let value = contents
        .parse::<toml::Table>()
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))?;
    Ok(value
        .get("mcp_servers")
        .and_then(|servers| servers.as_table())
        .map(|servers| servers.keys().cloned().collect())
        .unwrap_or_default())
}

fn scan_mcp(
    resources: &mut Vec<SettingsResource>,
    seen: &mut HashSet<(String, String, String)>,
    root: &Path,
    scope: &str,
) -> Result<(), String> {
    for relative in [".mcp.json", ".codex/config.toml", ".claude.json"] {
        let path = root.join(relative);
        for name in parse_mcp_names(&path)? {
            push_resource(resources, seen, "mcp", name, &path, scope);
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn discover_settings_resources(
    repo_paths: Vec<String>,
) -> Result<Vec<SettingsResource>, String> {
    let mut resources = Vec::new();
    let mut seen = HashSet::new();

    if let Some(home) = dirs::home_dir() {
        scan_named_files(&mut resources, &mut seen, &home, "User")?;
        scan_mcp(&mut resources, &mut seen, &home, "User")?;
    }

    for repo_path in repo_paths {
        let root = PathBuf::from(&repo_path);
        let scope = root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        scan_named_files(&mut resources, &mut seen, &root, &scope)?;
        scan_mcp(&mut resources, &mut seen, &root, &scope)?;
    }

    resources.sort_by(|left, right| {
        left.kind
            .cmp(right.kind)
            .then_with(|| left.scope.cmp(&right.scope))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(resources)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_repo_resources() {
        let temp = tempfile::tempdir().unwrap();
        let skill = temp.path().join(".agents/skills/polish");
        let agent = temp.path().join(".codex/agents");
        fs::create_dir_all(&skill).unwrap();
        fs::create_dir_all(&agent).unwrap();
        fs::write(skill.join("SKILL.md"), "# Polish").unwrap();
        fs::write(agent.join("reviewer.toml"), "name = 'reviewer'").unwrap();
        fs::write(
            temp.path().join(".mcp.json"),
            r#"{"mcpServers":{"filesystem":{"command":"mcp"},"github":{"command":"gh-mcp"}}}"#,
        )
        .unwrap();

        let mut resources = Vec::new();
        let mut seen = HashSet::new();
        scan_named_files(&mut resources, &mut seen, temp.path(), "repo").unwrap();
        scan_mcp(&mut resources, &mut seen, temp.path(), "repo").unwrap();

        assert!(resources
            .iter()
            .any(|item| item.kind == "skill" && item.name == "polish"));
        assert!(resources
            .iter()
            .any(|item| item.kind == "agent" && item.name == "reviewer"));
        assert!(resources
            .iter()
            .any(|item| item.kind == "mcp" && item.name == "filesystem"));
        assert!(resources
            .iter()
            .any(|item| item.kind == "mcp" && item.name == "github"));
    }

    #[test]
    fn parses_toml_server_names() {
        let temp = tempfile::tempdir().unwrap();
        let config = temp.path().join("config.toml");
        fs::write(
            &config,
            "[mcp_servers.\"team.github\"] # local server\ncommand = \"mcp\"\n",
        )
        .unwrap();

        assert_eq!(parse_mcp_names(&config).unwrap(), vec!["team.github"]);
    }

    #[test]
    fn reports_invalid_mcp_config() {
        let temp = tempfile::tempdir().unwrap();
        let config = temp.path().join("config.json");
        fs::write(&config, "{").unwrap();

        assert!(parse_mcp_names(&config)
            .unwrap_err()
            .contains("Failed to parse"));
    }
}
