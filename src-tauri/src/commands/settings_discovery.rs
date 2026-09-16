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
) {
    for prefix in [".agents", ".codex", ".claude"] {
        let base = root.join(prefix);
        let skills = base.join("skills");
        if let Ok(entries) = fs::read_dir(&skills) {
            for entry in entries.flatten() {
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

        let agents = base.join("agents");
        if let Ok(entries) = fs::read_dir(&agents) {
            for entry in entries.flatten() {
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
    }
}

fn parse_mcp_names(path: &Path) -> Vec<String> {
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    if path.extension().and_then(|value| value.to_str()) == Some("json") {
        return serde_json::from_str::<serde_json::Value>(&contents)
            .ok()
            .and_then(|value| value.get("mcpServers").cloned())
            .and_then(|value| value.as_object().cloned())
            .map(|servers| servers.keys().cloned().collect())
            .unwrap_or_default();
    }

    contents
        .lines()
        .filter_map(|line| {
            line.trim()
                .strip_prefix("[mcp_servers.")
                .and_then(|value| value.strip_suffix(']'))
                .and_then(|value| value.split('.').next())
                .map(|value| value.trim_matches('"').to_string())
        })
        .collect()
}

fn scan_mcp(
    resources: &mut Vec<SettingsResource>,
    seen: &mut HashSet<(String, String, String)>,
    root: &Path,
    scope: &str,
) {
    for relative in [".mcp.json", ".codex/config.toml", ".claude.json"] {
        let path = root.join(relative);
        for name in parse_mcp_names(&path) {
            push_resource(resources, seen, "mcp", name, &path, scope);
        }
    }
}

#[tauri::command]
pub fn discover_settings_resources(repo_paths: Vec<String>) -> Vec<SettingsResource> {
    let mut resources = Vec::new();
    let mut seen = HashSet::new();

    if let Some(home) = dirs::home_dir() {
        scan_named_files(&mut resources, &mut seen, &home, "User");
        scan_mcp(&mut resources, &mut seen, &home, "User");
    }

    for repo_path in repo_paths {
        let root = PathBuf::from(&repo_path);
        let scope = root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        scan_named_files(&mut resources, &mut seen, &root, &scope);
        scan_mcp(&mut resources, &mut seen, &root, &scope);
    }

    resources.sort_by(|left, right| {
        left.kind
            .cmp(right.kind)
            .then_with(|| left.scope.cmp(&right.scope))
            .then_with(|| left.name.cmp(&right.name))
    });
    resources
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
        scan_named_files(&mut resources, &mut seen, temp.path(), "repo");
        scan_mcp(&mut resources, &mut seen, temp.path(), "repo");

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
}
