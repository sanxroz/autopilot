#![allow(deprecated)]

mod commands;

use commands::{git, github, process, terminal, watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::{Listener, WebviewWindow};

#[cfg(target_os = "macos")]
fn position_traffic_lights(window: &WebviewWindow, x: f64, y: f64) {
    use cocoa::appkit::{NSView, NSWindow, NSWindowButton};
    use cocoa::foundation::NSRect;
    use objc::{msg_send, runtime::YES, sel, sel_impl};

    let ns_window = window.ns_window().unwrap() as cocoa::base::id;

    unsafe {
        let close = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let minimize = ns_window.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom = ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);

        let title_bar_container_view = close.superview().superview();

        let close_rect: NSRect = msg_send![close, frame];
        let button_height = close_rect.size.height;
        let button_width = close_rect.size.width;
        let spacing = 6.0;

        let title_bar_frame_height: f64 = {
            let frame: NSRect = msg_send![title_bar_container_view, frame];
            frame.size.height
        };
        let calculated_y = title_bar_frame_height - y - button_height;

        let close_frame = NSRect::new(
            cocoa::foundation::NSPoint::new(x, calculated_y),
            cocoa::foundation::NSSize::new(button_width, button_height),
        );
        let _: () = msg_send![close, setFrame: close_frame];
        let _: () = msg_send![close, setNeedsDisplay: YES];

        let minimize_frame = NSRect::new(
            cocoa::foundation::NSPoint::new(x + button_width + spacing, calculated_y),
            cocoa::foundation::NSSize::new(button_width, button_height),
        );
        let _: () = msg_send![minimize, setFrame: minimize_frame];
        let _: () = msg_send![minimize, setNeedsDisplay: YES];

        let zoom_frame = NSRect::new(
            cocoa::foundation::NSPoint::new(x + (button_width + spacing) * 2.0, calculated_y),
            cocoa::foundation::NSSize::new(button_width, button_height),
        );
        let _: () = msg_send![zoom, setFrame: zoom_frame];
        let _: () = msg_send![zoom, setNeedsDisplay: YES];
    }
}

pub struct AppState {
    pub terminals: Arc<Mutex<HashMap<String, terminal::TerminalSession>>>,
    pub agent_terminals: Arc<Mutex<HashMap<String, Arc<terminal::AgentTerminalInfo>>>>,
    pub terminal_worktrees: Arc<Mutex<HashMap<String, String>>>,
    pub agent_hook_runtime: Option<terminal::AgentHookRuntime>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
            agent_terminals: Arc::new(Mutex::new(HashMap::new())),
            terminal_worktrees: Arc::new(Mutex::new(HashMap::new())),
            agent_hook_runtime: None,
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminals = Arc::new(Mutex::new(HashMap::new()));
    let agent_terminals = Arc::new(Mutex::new(HashMap::new()));
    let terminal_worktrees: Arc<Mutex<HashMap<String, String>>> =
        Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let hook_runtime = terminal::initialize_agent_hook_runtime(
                app.handle().clone(),
                agent_terminals.clone(),
                terminal_worktrees.clone(),
            );

            app.manage(AppState {
                terminals: terminals.clone(),
                agent_terminals: agent_terminals.clone(),
                terminal_worktrees: terminal_worktrees.clone(),
                agent_hook_runtime: hook_runtime,
            });

            #[cfg(target_os = "macos")]
            {
                let window = app.get_webview_window("main").unwrap();
                position_traffic_lights(&window, 12.0, 10.0);

                let window_clone = window.clone();
                window.listen("tauri://resize", move |_| {
                    position_traffic_lights(&window_clone, 12.0, 10.0);
                });
            }
            Ok(())
        })
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            git::discover_repository,
            git::list_worktrees,
            git::create_worktree,
            git::create_worktree_auto,
            git::delete_worktree,
            git::list_branches,
            git::get_worktree_info,
            git::get_worktree_branch_name,
            git::get_worktrees_diff_stats,
            git::get_changed_files,
            git::get_file_diff,
            git::get_uncommitted_files,
            git::get_uncommitted_diff,
            git::get_file_content,
            git::get_git_status,
            git::git_stage_files,
            git::git_unstage_files,
            git::git_commit,
            git::git_push,
            git::git_stage_all,
            git::git_unstage_all,
            git::generate_commit_message,
            github::check_gh_cli,
            github::check_gh_auth,
            github::get_pr_for_branch,
            github::get_all_prs_for_repos,
            github::get_all_open_prs_for_repos,
            github::get_pr_status,
            github::get_repo_from_remote,
            github::get_pr_checks,
            github::get_pr_details,
            github::get_pr_files,
            github::get_pr_commits,
            github::get_pr_file_diff,
            github::approve_pr,
            github::request_changes_pr,
            github::comment_on_pr,
            github::create_pr_review_comment,
            github::submit_pr_review,
            github::close_pr,
            github::rerequest_pr_review,
            github::create_pr,
            github::run_cubic_review,
            github::merge_pr,
            github::get_assigned_issues,
            github::get_notifications,
            process::get_worktree_process_status,
            process::get_all_worktrees_process_status,
            terminal::spawn_terminal,
            terminal::spawn_terminal_with_command,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
            watcher::start_watching_repository,
            watcher::stop_watching_repository,
            watcher::stop_all_watchers,
            watcher::start_watching_worktree_files,
            watcher::stop_watching_worktree_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
