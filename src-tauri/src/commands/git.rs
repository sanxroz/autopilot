use chrono::{DateTime, Utc};
use git2::{BranchType, Repository, WorktreeAddOptions};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
}

fn get_last_modified(path: &std::path::Path) -> Option<String> {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .map(|time| {
            let datetime: DateTime<Utc> = time.into();
            datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        })
}

fn get_worktree_branch(repo_path: &std::path::Path) -> Option<String> {
    let repo = Repository::open(repo_path).ok()?;
    let head = repo.head().ok()?;
    head.shorthand().map(String::from)
}

#[tauri::command]
pub fn discover_repository(path: String) -> Result<RepoInfo, String> {
    let path_buf = PathBuf::from(&path);
    let repo = Repository::discover(&path_buf).map_err(|e| e.message().to_string())?;

    let workdir = repo
        .workdir()
        .ok_or("Not a regular repository")?
        .to_path_buf();

    let name = workdir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(RepoInfo {
        path: workdir.to_string_lossy().to_string(),
        name,
    })
}

#[tauri::command]
pub fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let worktrees = repo.worktrees().map_err(|e| e.message().to_string())?;

    let mut result = Vec::new();

    let main_workdir = repo.workdir().map(|p| p.to_path_buf());
    if let Some(main_path) = main_workdir {
        let branch = get_worktree_branch(&main_path);
        let last_modified = get_last_modified(&main_path);

        result.push(WorktreeInfo {
            name: "main".to_string(),
            path: main_path.to_string_lossy().to_string(),
            branch,
            last_modified,
        });
    }

    for wt_name in worktrees.iter().flatten() {
        if let Ok(wt) = repo.find_worktree(wt_name) {
            let wt_path = wt.path().to_path_buf();
            let branch = get_worktree_branch(&wt_path);
            let last_modified = get_last_modified(&wt_path);

            result.push(WorktreeInfo {
                name: wt_name.to_string(),
                path: wt_path.to_string_lossy().to_string(),
                branch,
                last_modified,
            });
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn get_worktree_info(worktree_path: String) -> Result<WorktreeInfo, String> {
    let path = PathBuf::from(&worktree_path);
    let branch = get_worktree_branch(&path);
    let last_modified = get_last_modified(&path);

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(WorktreeInfo {
        name,
        path: worktree_path,
        branch,
        last_modified,
    })
}

#[tauri::command]
pub fn list_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let mut branches = Vec::new();

    let head_name = repo.head().ok().and_then(|h| h.shorthand().map(String::from));

    for branch_result in repo
        .branches(Some(BranchType::Local))
        .map_err(|e| e.message().to_string())?
    {
        if let Ok((branch, _)) = branch_result {
            if let Some(name) = branch.name().ok().flatten() {
                branches.push(BranchInfo {
                    name: name.to_string(),
                    is_remote: false,
                    is_head: head_name.as_deref() == Some(name),
                });
            }
        }
    }

    for branch_result in repo
        .branches(Some(BranchType::Remote))
        .map_err(|e| e.message().to_string())?
    {
        if let Ok((branch, _)) = branch_result {
            if let Some(name) = branch.name().ok().flatten() {
                if !name.contains("HEAD") {
                    branches.push(BranchInfo {
                        name: name.to_string(),
                        is_remote: true,
                        is_head: false,
                    });
                }
            }
        }
    }

    Ok(branches)
}

#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    worktree_name: String,
    branch_name: String,
    target_path: Option<String>,
) -> Result<WorktreeInfo, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let wt_path = match target_path {
        Some(p) => PathBuf::from(p),
        None => {
            let repo_parent = PathBuf::from(&repo_path)
                .parent()
                .ok_or("Cannot get parent directory")?
                .to_path_buf();
            repo_parent.join(&worktree_name)
        }
    };

    let branch = repo
        .find_branch(&branch_name, BranchType::Local)
        .or_else(|_| {
            let remote_name = format!("origin/{}", branch_name);
            repo.find_branch(&remote_name, BranchType::Remote)
                .and_then(|remote_branch| {
                    let commit = remote_branch.get().peel_to_commit()?;
                    repo.branch(&branch_name, &commit, false)
                })
        })
        .map_err(|e| format!("Branch not found: {}", e.message()))?;

    let mut opts = WorktreeAddOptions::new();
    let branch_ref = branch.into_reference();
    opts.reference(Some(&branch_ref));

    repo.worktree(&worktree_name, &wt_path, Some(&opts))
        .map_err(|e| e.message().to_string())?;

    let last_modified = get_last_modified(&wt_path);

    Ok(WorktreeInfo {
        name: worktree_name,
        path: wt_path.to_string_lossy().to_string(),
        branch: Some(branch_name),
        last_modified,
    })
}

#[tauri::command]
pub fn delete_worktree(repo_path: String, worktree_name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let worktree = repo
        .find_worktree(&worktree_name)
        .map_err(|e| e.message().to_string())?;

    let wt_path = worktree.path().to_path_buf();

    let mut prune_opts = git2::WorktreePruneOptions::new();
    prune_opts.valid(true);
    prune_opts.working_tree(true);

    worktree
        .prune(Some(&mut prune_opts))
        .map_err(|e| e.message().to_string())?;

    if wt_path.exists() {
        std::fs::remove_dir_all(&wt_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
