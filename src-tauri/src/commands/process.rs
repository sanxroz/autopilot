use serde::{Deserialize, Serialize};
use std::path::Path;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    DevServer,
    AgentRunning,
    None,
}

fn is_dev_server_process(cmd: &[String]) -> bool {
    let cmd_str = cmd.join(" ").to_lowercase();

    (cmd_str.contains("npm") && (cmd_str.contains(" dev") || cmd_str.contains(" start")))
        || (cmd_str.contains("bun") && cmd_str.contains(" dev"))
        || (cmd_str.contains("vite") && !cmd_str.contains("build"))
        || cmd_str.contains("next dev")
        || cmd_str.contains("next start")
        || (cmd_str.contains("yarn") && cmd_str.contains(" dev"))
        || (cmd_str.contains("pnpm") && cmd_str.contains(" dev"))
        || cmd_str.contains("webpack-dev-server")
        || cmd_str.contains("webpack serve")
        || cmd_str.contains("react-scripts start")
        || cmd_str.contains("ng serve")
        || cmd_str.contains("nuxt dev")
        || cmd_str.contains("remix dev")
        || cmd_str.contains("astro dev")
        || cmd_str.contains("svelte-kit dev")
        || cmd_str.contains("cargo watch")
        || cmd_str.contains("cargo run")
        || (cmd_str.contains("python")
            && cmd_str.contains("manage.py")
            && cmd_str.contains("runserver"))
        || (cmd_str.contains("flask") && cmd_str.contains("run"))
        || (cmd_str.contains("uvicorn") || cmd_str.contains("gunicorn"))
        || cmd_str.contains("nodemon")
        || cmd_str.contains("ts-node-dev")
        || cmd_str.contains("tsx watch")
}

fn is_ai_agent_process(cmd: &[String], name: &str) -> bool {
    let cmd_str = cmd.join(" ").to_lowercase();
    let name_lower = name.to_lowercase();

    name_lower.contains("claude")
        || name_lower.contains("droid")
        || name_lower.contains("opencode")
        || name_lower.contains("aider")
        || name_lower.contains("cursor")
        || name_lower.contains("codeium")
        || name_lower.contains("copilot")
        || name_lower.contains("tabnine")
        || cmd_str.contains("claude")
        || cmd_str.contains("droid")
        || cmd_str.contains("opencode")
        || cmd_str.contains("aider")
        || cmd_str.contains("cursor-agent")
        || cmd_str.contains("codeium")
        || cmd_str.contains("github-copilot")
        || cmd_str.contains("amp ")
        || cmd_str.contains("/amp")
}

fn is_process_in_worktree(cwd: Option<&Path>, worktree_path: &Path) -> bool {
    match cwd {
        Some(process_cwd) => process_cwd == worktree_path || process_cwd.starts_with(worktree_path),
        None => false,
    }
}

fn create_process_refresh_system() -> System {
    let refresh_kind = ProcessRefreshKind::new()
        .with_cmd(UpdateKind::Always)
        .with_cwd(UpdateKind::Always);

    let mut system = System::new();

    system.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh_kind);
    system
}

#[tauri::command]
pub fn get_worktree_process_status(worktree_path: String) -> ProcessStatus {
    let system = create_process_refresh_system();
    let worktree_path = Path::new(&worktree_path);

    let mut has_dev_server = false;
    let mut has_agent = false;

    for (_pid, process) in system.processes() {
        if !is_process_in_worktree(process.cwd(), worktree_path) {
            continue;
        }

        let cmd: Vec<String> = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        let name = process.name().to_string_lossy().to_string();

        if is_ai_agent_process(&cmd, &name) {
            has_agent = true;
        }

        if is_dev_server_process(&cmd) {
            has_dev_server = true;
        }

        if has_agent && has_dev_server {
            break;
        }
    }

    match (has_agent, has_dev_server) {
        (true, _) => ProcessStatus::AgentRunning,
        (false, true) => ProcessStatus::DevServer,
        _ => ProcessStatus::None,
    }
}

#[tauri::command]
pub fn get_all_worktrees_process_status(
    worktree_paths: Vec<String>,
) -> std::collections::HashMap<String, ProcessStatus> {
    let system = create_process_refresh_system();

    let mut results: std::collections::HashMap<String, ProcessStatus> = worktree_paths
        .iter()
        .map(|p| (p.clone(), ProcessStatus::None))
        .collect();

    let worktree_paths_parsed: Vec<(&String, std::path::PathBuf)> = worktree_paths
        .iter()
        .map(|p| (p, std::path::PathBuf::from(p)))
        .collect();

    for (_pid, process) in system.processes() {
        let process_cwd = match process.cwd() {
            Some(cwd) => cwd,
            None => continue,
        };

        let cmd: Vec<String> = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        let name = process.name().to_string_lossy().to_string();

        let is_agent = is_ai_agent_process(&cmd, &name);
        let is_dev = is_dev_server_process(&cmd);

        if !is_agent && !is_dev {
            continue;
        }

        for (path_str, path) in &worktree_paths_parsed {
            if process_cwd == path.as_path() || process_cwd.starts_with(path) {
                let current_status = results.get(*path_str).unwrap_or(&ProcessStatus::None);

                let new_status = if is_agent {
                    ProcessStatus::AgentRunning
                } else if is_dev && *current_status != ProcessStatus::AgentRunning {
                    ProcessStatus::DevServer
                } else {
                    continue;
                };

                results.insert((*path_str).clone(), new_status);
            }
        }
    }

    results
}
