mod commands;

use commands::{git, terminal};
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
            // Git commands
            git::discover_repository,
            git::list_worktrees,
            git::create_worktree,
            git::delete_worktree,
            git::list_branches,
            git::get_worktree_info,
            // Terminal commands
            terminal::spawn_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
