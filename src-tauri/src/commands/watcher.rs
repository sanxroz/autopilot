use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
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

#[derive(Clone, serde::Serialize)]
pub struct FileChangeEvent {
    pub worktree_path: String,
}

async fn emit_after_quiet<F>(
    mut changes: tokio::sync::watch::Receiver<()>,
    delay: Duration,
    mut emit: F,
) where
    F: FnMut() + Send,
{
    while changes.changed().await.is_ok() {
        loop {
            tokio::select! {
                result = changes.changed() => {
                    if result.is_err() {
                        return;
                    }
                }
                _ = tokio::time::sleep(delay) => {
                    emit();
                    break;
                }
            }
        }
    }
}

pub struct GitWatcher {
    watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
    file_watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
    app_handle: AppHandle,
}

fn canonicalize_path(path: &PathBuf) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.clone())
}

fn is_ignored_worktree_event_path(
    repo: Option<&git2::Repository>,
    worktree_path: &Path,
    path: &Path,
) -> bool {
    let Some(relative_path) = worktree_event_relative_path(worktree_path, path) else {
        return false;
    };

    if is_git_internal_path(&relative_path) {
        return true;
    }

    repo.and_then(|repo| repo.status_should_ignore(&relative_path).ok())
        .unwrap_or(false)
}

fn worktree_event_relative_path(worktree_path: &Path, path: &Path) -> Option<PathBuf> {
    if path.is_relative() {
        Some(path.to_path_buf())
    } else if let Ok(relative_path) = path.strip_prefix(worktree_path) {
        Some(relative_path.to_path_buf())
    } else if let Ok(normalized_path) = path.canonicalize() {
        normalized_path
            .strip_prefix(worktree_path)
            .map(Path::to_path_buf)
            .ok()
    } else {
        None
    }
}

fn is_git_internal_path(relative_path: &Path) -> bool {
    relative_path
        .components()
        .any(|component| component.as_os_str() == ".git")
}

fn is_autopilot_context_path(worktree_path: &Path, path: &Path) -> bool {
    worktree_event_relative_path(worktree_path, path).as_deref() == Some(Path::new(".autopilot.md"))
}

impl GitWatcher {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            file_watchers: Arc::new(Mutex::new(HashMap::new())),
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
        let mut file_watchers = self.file_watchers.lock();
        file_watchers.clear();
    }

    pub fn watch_worktree_files(&self, worktree_path: String) -> Result<(), String> {
        let mut file_watchers = self.file_watchers.lock();
        file_watchers.remove(&worktree_path);

        let app_handle = self.app_handle.clone();
        let worktree_path_clone = worktree_path.clone();
        let worktree_pathbuf = PathBuf::from(&worktree_path);
        let ignored_path_root = canonicalize_path(&worktree_pathbuf);
        let ignored_repo = git2::Repository::open(&ignored_path_root).ok();

        if !worktree_pathbuf.exists() {
            return Err("Worktree path does not exist".to_string());
        }

        let (file_change_tx, file_change_rx) = tokio::sync::watch::channel(());
        tauri::async_runtime::spawn(emit_after_quiet(
            file_change_rx,
            Duration::from_millis(300),
            move || {
                let _ = app_handle.emit(
                    "file-changed",
                    FileChangeEvent {
                        worktree_path: worktree_path_clone.clone(),
                    },
                );
            },
        ));

        let app_handle = self.app_handle.clone();
        let worktree_path_clone = worktree_path.clone();
        let (context_change_tx, context_change_rx) = tokio::sync::watch::channel(());
        tauri::async_runtime::spawn(emit_after_quiet(
            context_change_rx,
            Duration::from_millis(300),
            move || {
                let _ = app_handle.emit(
                    "autopilot-context-changed",
                    FileChangeEvent {
                        worktree_path: worktree_path_clone.clone(),
                    },
                );
            },
        ));

        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    match event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) => {
                            if event
                                .paths
                                .iter()
                                .any(|path| is_autopilot_context_path(&ignored_path_root, path))
                            {
                                let _ = context_change_tx.send(());
                            }
                            if !event.paths.is_empty()
                                && event.paths.iter().all(|path| {
                                    is_ignored_worktree_event_path(
                                        ignored_repo.as_ref(),
                                        &ignored_path_root,
                                        path,
                                    )
                                })
                            {
                                return;
                            }
                            let _ = file_change_tx.send(());
                        }
                        _ => {}
                    }
                }
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )
        .map_err(|e| e.to_string())?;

        let mut watcher = watcher;
        watcher
            .watch(&worktree_pathbuf, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        file_watchers.insert(worktree_path, watcher);
        Ok(())
    }

    pub fn unwatch_worktree_files(&self, worktree_path: &str) {
        let mut file_watchers = self.file_watchers.lock();
        file_watchers.remove(worktree_path);
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

#[tauri::command]
pub fn start_watching_worktree_files(
    app_handle: AppHandle,
    state: tauri::State<'_, WatcherState>,
    worktree_path: String,
) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock();

    if watcher_guard.is_none() {
        *watcher_guard = Some(GitWatcher::new(app_handle));
    }

    if let Some(ref watcher) = *watcher_guard {
        watcher.watch_worktree_files(worktree_path)?;
    }

    Ok(())
}

#[tauri::command]
pub fn stop_watching_worktree_files(
    state: tauri::State<'_, WatcherState>,
    worktree_path: String,
) -> Result<(), String> {
    let watcher_guard = state.watcher.lock();

    if let Some(ref watcher) = *watcher_guard {
        watcher.unwatch_worktree_files(&worktree_path);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{emit_after_quiet, is_autopilot_context_path};
    use std::time::Duration;

    #[tokio::test]
    async fn worktree_file_events_are_trailing_debounced() {
        let (change_tx, change_rx) = tokio::sync::watch::channel(());
        let (emit_tx, mut emit_rx) = tokio::sync::mpsc::unbounded_channel();

        let debounce_task = tokio::spawn(emit_after_quiet(
            change_rx,
            Duration::from_millis(80),
            move || {
                let _ = emit_tx.send(());
            },
        ));

        let _ = change_tx.send(());
        tokio::time::sleep(Duration::from_millis(30)).await;
        let _ = change_tx.send(());
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(emit_rx.try_recv().is_err());

        tokio::time::timeout(Duration::from_millis(100), emit_rx.recv())
            .await
            .expect("debounced event should be emitted")
            .expect("debouncer should remain active");
        assert!(emit_rx.try_recv().is_err());

        let _ = change_tx.send(());
        drop(change_tx);
        debounce_task.await.expect("debouncer task should finish");
        assert!(emit_rx.try_recv().is_err());
    }

    #[test]
    fn identifies_only_the_root_autopilot_context_file() {
        let worktree = std::env::temp_dir().join("worktree");

        assert!(is_autopilot_context_path(
            &worktree,
            &worktree.join(".autopilot.md")
        ));
        assert!(!is_autopilot_context_path(
            &worktree,
            &worktree.join("nested/.autopilot.md")
        ));
    }
}
