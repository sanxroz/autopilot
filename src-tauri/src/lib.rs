mod commands;

use commands::{git, github, process, terminal};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

pub struct AppState {
    pub terminals: Arc<Mutex<HashMap<String, terminal::TerminalSession>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            git::discover_repository,
            git::list_worktrees,
            git::create_worktree,
            git::create_worktree_auto,
            git::delete_worktree,
            git::list_branches,
            git::get_worktree_info,
            git::get_changed_files,
            git::get_file_diff,
            git::get_file_content,
            github::check_gh_cli,
            github::check_gh_auth,
            github::get_pr_for_branch,
            github::get_all_prs_for_repos,
            github::get_pr_status,
            github::get_repo_from_remote,
            github::get_pr_checks,
            github::get_pr_details,
            github::create_pr,
            github::run_cubic_review,
            process::get_worktree_process_status,
            process::get_all_worktrees_process_status,
            terminal::spawn_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
