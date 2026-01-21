use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct GitChangeEvent {
    pub repo_path: String,
    pub worktree_path: String,
    pub change_type: String,
}

#[derive(Clone, serde::Serialize)]
pub struct WorktreeChangeEvent {
    pub repo_path: String,
    pub change_type: String,
}

#[derive(Clone, serde::Serialize)]
pub struct GitIndexChangeEvent {
    pub repo_path: String,
    pub worktree_path: String,
}

pub struct GitWatcher {
    watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
    app_handle: AppHandle,
}

fn canonicalize_path(path: &PathBuf) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.clone())
}

impl GitWatcher {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
        }
    }

    pub fn watch_repository(
        &self,
        repo_path: String,
        worktree_paths: Vec<String>,
    ) -> Result<(), String> {
        let mut watchers = self.watchers.lock();
        watchers.remove(&repo_path);

        let app_handle = self.app_handle.clone();
        let app_handle_worktree = self.app_handle.clone();
        let app_handle_index = self.app_handle.clone();
        let repo_path_clone = repo_path.clone();
        let repo_path_for_worktree = repo_path.clone();
        let repo_path_for_index = repo_path.clone();

        let mut git_head_to_worktree: HashMap<PathBuf, String> = HashMap::new();
        let mut git_index_to_worktree: HashMap<PathBuf, String> = HashMap::new();
        let mut dirs_to_watch: Vec<PathBuf> = Vec::new();

        // Track the main .git/worktrees directory for worktree additions/removals
        let repo_pathbuf = PathBuf::from(&repo_path);
        let git_worktrees_dir = repo_pathbuf.join(".git").join("worktrees");
        let canonical_worktrees_dir = if git_worktrees_dir.exists() {
            Some(canonicalize_path(&git_worktrees_dir))
        } else {
            None
        };

        for wt_path in &worktree_paths {
            let wt_pathbuf = PathBuf::from(wt_path);
            let git_path = wt_pathbuf.join(".git");

            if git_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&git_path) {
                    if let Some(gitdir) = content.strip_prefix("gitdir: ") {
                        let gitdir = gitdir.trim();
                        let gitdir_path = PathBuf::from(gitdir);
                        let head_path = canonicalize_path(&gitdir_path.join("HEAD"));
                        git_head_to_worktree.insert(head_path, wt_path.clone());

                        let index_path = canonicalize_path(&gitdir_path.join("index"));
                        git_index_to_worktree.insert(index_path, wt_path.clone());

                        let canonical_gitdir = canonicalize_path(&gitdir_path);
                        if canonical_gitdir.exists() {
                            dirs_to_watch.push(canonical_gitdir);
                        }
                    }
                }
            } else if git_path.is_dir() {
                let head_path = canonicalize_path(&git_path.join("HEAD"));
                git_head_to_worktree.insert(head_path, wt_path.clone());

                let index_path = canonicalize_path(&git_path.join("index"));
                git_index_to_worktree.insert(index_path, wt_path.clone());

                let canonical_git = canonicalize_path(&git_path);
                if canonical_git.exists() {
                    dirs_to_watch.push(canonical_git);
                }
            }
        }

        if git_head_to_worktree.is_empty() && canonical_worktrees_dir.is_none() {
            return Ok(());
        }

        let git_head_to_worktree = Arc::new(git_head_to_worktree);
        let git_head_to_worktree_for_handler = git_head_to_worktree.clone();
        let git_index_to_worktree = Arc::new(git_index_to_worktree);
        let git_index_to_worktree_for_handler = git_index_to_worktree.clone();
        let canonical_worktrees_dir_arc = Arc::new(canonical_worktrees_dir);
        let canonical_worktrees_dir_for_handler = canonical_worktrees_dir_arc.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    match event.kind {
                        EventKind::Modify(ModifyKind::Data(_))
                        | EventKind::Modify(ModifyKind::Any)
                        | EventKind::Modify(ModifyKind::Name(_))
                        | EventKind::Create(_) => {
                            for path in &event.paths {
                                // Check for HEAD file changes (branch checkout)
                                if path.file_name().map(|n| n == "HEAD").unwrap_or(false) {
                                    let canonical_path = canonicalize_path(path);

                                    if let Some(wt_path) =
                                        git_head_to_worktree_for_handler.get(&canonical_path)
                                    {
                                        let _ = app_handle.emit(
                                            "git-head-changed",
                                            GitChangeEvent {
                                                repo_path: repo_path_clone.clone(),
                                                worktree_path: wt_path.clone(),
                                                change_type: "branch".to_string(),
                                            },
                                        );
                                    } else if let Some(wt_path) =
                                        git_head_to_worktree_for_handler.get(path)
                                    {
                                        let _ = app_handle.emit(
                                            "git-head-changed",
                                            GitChangeEvent {
                                                repo_path: repo_path_clone.clone(),
                                                worktree_path: wt_path.clone(),
                                                change_type: "branch".to_string(),
                                            },
                                        );
                                    }
                                }

                                if path.file_name().map(|n| n == "index").unwrap_or(false) {
                                    let canonical_path = canonicalize_path(path);

                                    if let Some(wt_path) =
                                        git_index_to_worktree_for_handler.get(&canonical_path)
                                    {
                                        let _ = app_handle_index.emit(
                                            "git-index-changed",
                                            GitIndexChangeEvent {
                                                repo_path: repo_path_for_index.clone(),
                                                worktree_path: wt_path.clone(),
                                            },
                                        );
                                    } else if let Some(wt_path) =
                                        git_index_to_worktree_for_handler.get(path)
                                    {
                                        let _ = app_handle_index.emit(
                                            "git-index-changed",
                                            GitIndexChangeEvent {
                                                repo_path: repo_path_for_index.clone(),
                                                worktree_path: wt_path.clone(),
                                            },
                                        );
                                    }
                                }

                                if let Some(ref worktrees_dir) =
                                    *canonical_worktrees_dir_for_handler
                                {
                                    if path.starts_with(worktrees_dir) {
                                        let _ = app_handle_worktree.emit(
                                            "worktree-changed",
                                            WorktreeChangeEvent {
                                                repo_path: repo_path_for_worktree.clone(),
                                                change_type: "added".to_string(),
                                            },
                                        );
                                    }
                                }
                            }
                        }
                        EventKind::Remove(_) => {
                            // Check for worktree directory removal
                            for path in &event.paths {
                                if let Some(ref worktrees_dir) =
                                    *canonical_worktrees_dir_for_handler
                                {
                                    if path.starts_with(worktrees_dir) {
                                        let _ = app_handle_worktree.emit(
                                            "worktree-changed",
                                            WorktreeChangeEvent {
                                                repo_path: repo_path_for_worktree.clone(),
                                                change_type: "removed".to_string(),
                                            },
                                        );
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )
        .map_err(|e| e.to_string())?;

        for dir in dirs_to_watch {
            let _ = watcher.watch(&dir, RecursiveMode::NonRecursive);
        }

        // Watch the .git/worktrees directory for worktree additions/removals
        if let Some(ref worktrees_dir) = *canonical_worktrees_dir_arc {
            let _ = watcher.watch(worktrees_dir, RecursiveMode::Recursive);
        }

        watchers.insert(repo_path, watcher);
        Ok(())
    }

    pub fn unwatch_repository(&self, repo_path: &str) {
        let mut watchers = self.watchers.lock();
        watchers.remove(repo_path);
    }

    pub fn unwatch_all(&self) {
        let mut watchers = self.watchers.lock();
        watchers.clear();
    }
}

pub struct WatcherState {
    pub watcher: Mutex<Option<GitWatcher>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn start_watching_repository(
    app_handle: AppHandle,
    state: tauri::State<'_, WatcherState>,
    repo_path: String,
    worktree_paths: Vec<String>,
) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock();

    if watcher_guard.is_none() {
        *watcher_guard = Some(GitWatcher::new(app_handle));
    }

    if let Some(ref watcher) = *watcher_guard {
        watcher.watch_repository(repo_path, worktree_paths)?;
    }

    Ok(())
}

#[tauri::command]
pub fn stop_watching_repository(
    state: tauri::State<'_, WatcherState>,
    repo_path: String,
) -> Result<(), String> {
    let watcher_guard = state.watcher.lock();

    if let Some(ref watcher) = *watcher_guard {
        watcher.unwatch_repository(&repo_path);
    }

    Ok(())
}

#[tauri::command]
pub fn stop_all_watchers(state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    let watcher_guard = state.watcher.lock();

    if let Some(ref watcher) = *watcher_guard {
        watcher.unwatch_all();
    }

    Ok(())
}
