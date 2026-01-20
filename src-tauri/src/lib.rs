#![allow(deprecated)]

mod commands;

use commands::{git, github, process, terminal, watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

#[cfg(target_os = "macos")]
use tauri::{Manager, WebviewWindow, Listener};

#[cfg(target_os = "macos")]
fn position_traffic_lights(window: &WebviewWindow, x: f64, y: f64) {
    use cocoa::appkit::{NSView, NSWindow, NSWindowButton};
    use cocoa::foundation::NSRect;
    use objc::{msg_send, sel, sel_impl, runtime::YES};
    
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
        .setup(|app| {
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
        .manage(AppState::default())
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
            watcher::start_watching_repository,
            watcher::stop_watching_repository,
            watcher::stop_all_watchers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
