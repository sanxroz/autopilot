use chrono::{DateTime, Utc};
use git2::{BranchType, Delta, DiffOptions, Repository, WorktreeAddOptions};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use regex::Regex;

use super::cli_tools::find_cli_tool;

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub last_modified: Option<String>,
    pub diff_stats: Option<DiffStats>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileDiffData {
    pub path: String,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
    pub patch: String,
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

fn get_diff_stats_vs_origin_default(repo_path: &std::path::Path) -> Option<DiffStats> {
    let repo = Repository::open(repo_path).ok()?;
    
    let head = repo.head().ok()?;
    let head_commit = head.peel_to_commit().ok()?;
    
    let base_commit = repo
        .find_branch("origin/main", BranchType::Remote)
        .or_else(|_| repo.find_branch("origin/master", BranchType::Remote))
        .or_else(|_| repo.find_branch("main", BranchType::Local))
        .or_else(|_| repo.find_branch("master", BranchType::Local))
        .ok()?
        .get()
        .peel_to_commit()
        .ok()?;
    
    if head_commit.id() == base_commit.id() {
        return Some(DiffStats { additions: 0, deletions: 0 });
    }
    
    let base_tree = base_commit.tree().ok()?;
    let head_tree = head_commit.tree().ok()?;
    
    let diff = repo.diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None).ok()?;
    let stats = diff.stats().ok()?;
    
    Some(DiffStats {
        additions: stats.insertions(),
        deletions: stats.deletions(),
    })
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
            diff_stats: None,
        });
    }

    for wt_name in worktrees.iter().flatten() {
        if let Ok(wt) = repo.find_worktree(wt_name) {
            let wt_path = wt.path().to_path_buf();
            let branch = get_worktree_branch(&wt_path);
            let last_modified = get_last_modified(&wt_path);
            let diff_stats = get_diff_stats_vs_origin_default(&wt_path);

            result.push(WorktreeInfo {
                name: wt_name.to_string(),
                path: wt_path.to_string_lossy().to_string(),
                branch,
                last_modified,
                diff_stats,
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
    let diff_stats = get_diff_stats_vs_origin_default(&path);

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
        diff_stats,
    })
}

#[tauri::command]
pub fn get_worktree_branch_name(worktree_path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(&worktree_path);
    Ok(get_worktree_branch(&path))
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

const CITY_NAMES: &[&str] = &[
    "tokyo", "paris", "london", "berlin", "sydney", "toronto", "mumbai", "cairo",
    "rio", "seoul", "dublin", "oslo", "vienna", "prague", "lisbon", "athens",
    "rome", "madrid", "amsterdam", "brussels", "zurich", "stockholm", "helsinki",
    "warsaw", "budapest", "bangkok", "singapore", "jakarta", "manila", "hanoi",
    "beijing", "shanghai", "hongkong", "taipei", "osaka", "kyoto", "melbourne",
    "auckland", "vancouver", "montreal", "chicago", "boston", "seattle", "denver",
    "austin", "miami", "atlanta", "phoenix", "portland", "detroit", "dallas",
    "houston", "philadelphia", "sandiego", "sanfrancisco", "losangeles", "newyork",
    "nairobi", "lagos", "capetown", "casablanca", "tunis", "algiers", "accra",
    "lima", "bogota", "santiago", "buenosaires", "montevideo", "quito", "caracas",
    "havana", "mexicocity", "guadalajara", "panama", "sanjose", "kingston",
];

fn generate_unique_worktree_name(repo: &Repository) -> Result<String, String> {
    use rand::Rng;
    
    let mut rng = rand::rng();
    
    for _ in 0..100 {
        let city = CITY_NAMES[rng.random_range(0..CITY_NAMES.len())];
        let num: u32 = rng.random_range(100..999);
        let name = format!("{}-{}", num, city);
        
        let branch_exists = repo.find_branch(&name, BranchType::Local).is_ok();
        let ref_exists = repo.find_reference(&format!("refs/heads/{}", name)).is_ok();
        
        if !branch_exists && !ref_exists {
            return Ok(name);
        }
    }

    Err("Could not generate unique worktree name".to_string())
}

#[tauri::command]
pub fn create_worktree_auto(repo_path: String) -> Result<WorktreeInfo, String> {
    use std::process::Command;
    
    Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(&repo_path)
        .output()
        .ok();
    
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    
    let worktree_name = generate_unique_worktree_name(&repo)?;
    
    // Find default branch (origin/main or origin/master)
    let base_branch = if repo.find_branch("origin/main", BranchType::Remote).is_ok() {
        "main"
    } else if repo.find_branch("origin/master", BranchType::Remote).is_ok() {
        "master"
    } else {
        return Err("Cannot find origin/main or origin/master".to_string());
    };

    let worktrees_dir = PathBuf::from(&repo_path).join(".worktrees");
    if !worktrees_dir.exists() {
        std::fs::create_dir_all(&worktrees_dir).map_err(|e| e.to_string())?;
    }
    
    let wt_path = worktrees_dir.join(&worktree_name);

    let remote_name = format!("origin/{}", base_branch);
    let base_commit = repo
        .find_branch(&remote_name, BranchType::Remote)
        .map_err(|e| format!("Base branch not found: {}", e.message()))?
        .get()
        .peel_to_commit()
        .map_err(|e| format!("Cannot get commit: {}", e.message()))?;

    let new_branch = repo
        .branch(&worktree_name, &base_commit, false)
        .map_err(|e| format!("Cannot create branch: {}", e.message()))?;

    let mut opts = WorktreeAddOptions::new();
    let branch_ref = new_branch.into_reference();
    opts.reference(Some(&branch_ref));

    repo.worktree(&worktree_name, &wt_path, Some(&opts))
        .map_err(|e| e.message().to_string())?;

    let last_modified = get_last_modified(&wt_path);
    let diff_stats = get_diff_stats_vs_origin_default(&wt_path);

    Ok(WorktreeInfo {
        name: worktree_name.clone(),
        path: wt_path.to_string_lossy().to_string(),
        branch: Some(worktree_name),
        last_modified,
        diff_stats,
    })
}

#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    worktree_name: String,
    base_branch: String,
    new_branch_name: Option<String>,
    target_path: Option<String>,
) -> Result<WorktreeInfo, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let wt_path = match target_path {
        Some(p) => PathBuf::from(p),
        None => {
            PathBuf::from(&repo_path)
                .join(".worktrees")
                .join(&worktree_name)
        }
    };

    let branch_name = new_branch_name.unwrap_or_else(|| worktree_name.clone());

    let remote_name = format!("origin/{}", base_branch);
    let base_commit = repo
        .find_branch(&remote_name, BranchType::Remote)
        .or_else(|_| repo.find_branch(&base_branch, BranchType::Local))
        .map_err(|e| format!("Base branch not found: {}", e.message()))?
        .get()
        .peel_to_commit()
        .map_err(|e| format!("Cannot get commit: {}", e.message()))?;

    let new_branch = repo
        .branch(&branch_name, &base_commit, false)
        .map_err(|e| format!("Cannot create branch: {}", e.message()))?;

    let mut opts = WorktreeAddOptions::new();
    let branch_ref = new_branch.into_reference();
    opts.reference(Some(&branch_ref));

    repo.worktree(&worktree_name, &wt_path, Some(&opts))
        .map_err(|e| e.message().to_string())?;

    let last_modified = get_last_modified(&wt_path);
    let diff_stats = get_diff_stats_vs_origin_default(&wt_path);

    Ok(WorktreeInfo {
        name: worktree_name,
        path: wt_path.to_string_lossy().to_string(),
        branch: Some(branch_name),
        last_modified,
        diff_stats,
    })
}

#[tauri::command]
pub async fn delete_worktree(repo_path: String, worktree_name: String, force: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
        let worktree = repo
            .find_worktree(&worktree_name)
            .map_err(|e| e.message().to_string())?;

        let wt_path = worktree.path().to_path_buf();

        if force {
            if wt_path.exists() {
                std::fs::remove_dir_all(&wt_path).map_err(|e| e.to_string())?;
            }
            
            let git_worktrees_dir = PathBuf::from(&repo_path)
                .join(".git")
                .join("worktrees")
                .join(&worktree_name);
            if git_worktrees_dir.exists() {
                std::fs::remove_dir_all(&git_worktrees_dir).map_err(|e| e.to_string())?;
            }
        } else {
            let mut prune_opts = git2::WorktreePruneOptions::new();
            prune_opts.valid(true);
            prune_opts.working_tree(true);

            worktree
                .prune(Some(&mut prune_opts))
                .map_err(|e| e.message().to_string())?;

            if wt_path.exists() {
                std::fs::remove_dir_all(&wt_path).map_err(|e| e.to_string())?;
            }
        }

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_changed_files(worktree_path: String) -> Result<Vec<ChangedFile>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let base_branch_commit = repo
            .find_branch("origin/main", BranchType::Remote)
            .or_else(|_| repo.find_branch("origin/master", BranchType::Remote))
            .map_err(|e| format!("Cannot find origin/main or origin/master: {}", e.message()))?
            .get()
            .peel_to_commit()
            .map_err(|e| format!("Cannot get base commit: {}", e.message()))?;
        
        let head_commit = repo.head()
            .map_err(|e| format!("Cannot get HEAD: {}", e.message()))?
            .peel_to_commit()
            .map_err(|e| format!("Cannot get HEAD commit: {}", e.message()))?;
        
        let merge_base_oid = repo
            .merge_base(base_branch_commit.id(), head_commit.id())
            .map_err(|e| format!("Cannot find merge base: {}", e.message()))?;
        let merge_base_commit = repo
            .find_commit(merge_base_oid)
            .map_err(|e| format!("Cannot get merge base commit: {}", e.message()))?;
        let base_tree = merge_base_commit.tree().map_err(|e| e.message().to_string())?;
        
        let head_tree = head_commit.tree().map_err(|e| e.message().to_string())?;
        
        let mut diff_opts = DiffOptions::new();
        
        let diff = repo
            .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
            .map_err(|e| e.message().to_string())?;
        
        let mut files: Vec<ChangedFile> = Vec::new();
        let mut path_to_idx: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        
        for delta in diff.deltas() {
            let status = match delta.status() {
                Delta::Added => "added",
                Delta::Deleted => "deleted",
                Delta::Modified => "modified",
                Delta::Renamed => "renamed",
                Delta::Copied => "copied",
                Delta::Untracked => "untracked",
                _ => "unknown",
            };
            
            let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string());
            let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
            
            if let Some(path) = new_path.clone().or(old_path.clone()) {
                path_to_idx.insert(path.clone(), files.len());
                files.push(ChangedFile {
                    path,
                    status: status.to_string(),
                    old_path: if status == "renamed" { old_path } else { None },
                    additions: 0,
                    deletions: 0,
                });
            }
        }
        
        let _ = diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
            if let Some(path) = delta.new_file().path().or(delta.old_file().path()) {
                let path_str = path.to_string_lossy().to_string();
                if let Some(&idx) = path_to_idx.get(&path_str) {
                    match line.origin() {
                        '+' => files[idx].additions += 1,
                        '-' => files[idx].deletions += 1,
                        _ => {}
                    }
                }
            }
            true
        });
        
        Ok::<Vec<ChangedFile>, String>(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_file_diff(worktree_path: String, file_path: String) -> Result<FileDiffData, String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let base_branch_commit = repo
            .find_branch("origin/main", BranchType::Remote)
            .or_else(|_| repo.find_branch("origin/master", BranchType::Remote))
            .map_err(|e| format!("Cannot find origin/main or origin/master: {}", e.message()))?
            .get()
            .peel_to_commit()
            .map_err(|e| format!("Cannot get base commit: {}", e.message()))?;
        
        let head_commit = repo.head()
            .map_err(|e| format!("Cannot get HEAD: {}", e.message()))?
            .peel_to_commit()
            .map_err(|e| format!("Cannot get HEAD commit: {}", e.message()))?;
        
        let merge_base_oid = repo
            .merge_base(base_branch_commit.id(), head_commit.id())
            .map_err(|e| format!("Cannot find merge base: {}", e.message()))?;
        let merge_base_commit = repo
            .find_commit(merge_base_oid)
            .map_err(|e| format!("Cannot get merge base commit: {}", e.message()))?;
        let base_tree = merge_base_commit.tree().map_err(|e| e.message().to_string())?;
        
        let head_tree = head_commit.tree().map_err(|e| e.message().to_string())?;
        
        let old_content = base_tree
            .get_path(std::path::Path::new(&file_path))
            .ok()
            .and_then(|entry| repo.find_blob(entry.id()).ok())
            .and_then(|blob| String::from_utf8(blob.content().to_vec()).ok());
        
        let new_content = head_tree
            .get_path(std::path::Path::new(&file_path))
            .ok()
            .and_then(|entry| repo.find_blob(entry.id()).ok())
            .and_then(|blob| String::from_utf8(blob.content().to_vec()).ok());
        
        let mut diff_opts = DiffOptions::new();
        diff_opts.pathspec(&file_path);
        
        let diff = repo
            .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
            .map_err(|e| e.message().to_string())?;
        
        let mut patch = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                let origin = line.origin();
                if origin == '+' || origin == '-' || origin == ' ' {
                    patch.push(origin);
                }
                patch.push_str(content);
            }
            true
        }).map_err(|e| e.message().to_string())?;
        
        Ok::<FileDiffData, String>(FileDiffData {
            path: file_path,
            old_content,
            new_content,
            patch,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_uncommitted_files(worktree_path: String) -> Result<Vec<ChangedFile>, String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let head_commit = repo.head()
            .map_err(|e| format!("Cannot get HEAD: {}", e.message()))?
            .peel_to_commit()
            .map_err(|e| format!("Cannot get HEAD commit: {}", e.message()))?;
        let head_tree = head_commit.tree().map_err(|e| e.message().to_string())?;
        
        let mut diff_opts = DiffOptions::new();
        diff_opts.include_untracked(true);
        diff_opts.recurse_untracked_dirs(true);
        
        let diff = repo
            .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut diff_opts))
            .map_err(|e| e.message().to_string())?;
        
        let mut files: Vec<ChangedFile> = Vec::new();
        let mut path_to_idx: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        
        for delta in diff.deltas() {
            let status = match delta.status() {
                Delta::Added => "added",
                Delta::Deleted => "deleted",
                Delta::Modified => "modified",
                Delta::Renamed => "renamed",
                Delta::Copied => "copied",
                Delta::Untracked => "untracked",
                _ => "unknown",
            };
            
            let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string());
            let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
            
            if let Some(path) = new_path.clone().or(old_path.clone()) {
                path_to_idx.insert(path.clone(), files.len());
                files.push(ChangedFile {
                    path,
                    status: status.to_string(),
                    old_path: if status == "renamed" { old_path } else { None },
                    additions: 0,
                    deletions: 0,
                });
            }
        }
        
        let _ = diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
            if let Some(path) = delta.new_file().path().or(delta.old_file().path()) {
                let path_str = path.to_string_lossy().to_string();
                if let Some(&idx) = path_to_idx.get(&path_str) {
                    match line.origin() {
                        '+' => files[idx].additions += 1,
                        '-' => files[idx].deletions += 1,
                        _ => {}
                    }
                }
            }
            true
        });
        
        Ok::<Vec<ChangedFile>, String>(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_uncommitted_diff(worktree_path: String, file_path: String) -> Result<FileDiffData, String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let head_commit = repo.head()
            .map_err(|e| format!("Cannot get HEAD: {}", e.message()))?
            .peel_to_commit()
            .map_err(|e| format!("Cannot get HEAD commit: {}", e.message()))?;
        let head_tree = head_commit.tree().map_err(|e| e.message().to_string())?;
        
        let old_content = head_tree
            .get_path(std::path::Path::new(&file_path))
            .ok()
            .and_then(|entry| repo.find_blob(entry.id()).ok())
            .and_then(|blob| String::from_utf8(blob.content().to_vec()).ok());
        
        let workdir = repo.workdir().ok_or("No workdir")?;
        let full_path = workdir.join(&file_path);
        let new_content = std::fs::read_to_string(&full_path).ok();
        
        let is_new_file = old_content.is_none();
        
        let mut diff_opts = DiffOptions::new();
        diff_opts.pathspec(&file_path);
        diff_opts.include_untracked(true);
        
        let diff = repo
            .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut diff_opts))
            .map_err(|e| e.message().to_string())?;
        
        let mut patch = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                let origin = line.origin();
                if origin == '+' || origin == '-' || origin == ' ' {
                    patch.push(origin);
                }
                patch.push_str(content);
            }
            true
        }).map_err(|e| e.message().to_string())?;
        
        let patch = if patch.is_empty() && is_new_file {
            if let Some(ref content) = new_content {
                let lines: Vec<&str> = content.lines().collect();
                let line_count = lines.len();
                let mut synthetic_patch = format!("@@ -0,0 +1,{} @@\n", line_count);
                for line in lines {
                    synthetic_patch.push('+');
                    synthetic_patch.push_str(line);
                    synthetic_patch.push('\n');
                }
                synthetic_patch
            } else {
                patch
            }
        } else {
            patch
        };
        
        Ok::<FileDiffData, String>(FileDiffData {
            path: file_path,
            old_content,
            new_content,
            patch,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_file_content(
    worktree_path: String,
    file_path: String,
    git_ref: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        if let Some(ref_name) = git_ref {
            let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
            
            let reference = repo
                .find_branch(&ref_name, BranchType::Remote)
                .or_else(|_| repo.find_branch(&ref_name, BranchType::Local))
                .map_err(|e| format!("Cannot find ref {}: {}", ref_name, e.message()))?;
            
            let commit = reference
                .get()
                .peel_to_commit()
                .map_err(|e| e.message().to_string())?;
            
            let tree = commit.tree().map_err(|e| e.message().to_string())?;
            
            let entry = tree
                .get_path(std::path::Path::new(&file_path))
                .map_err(|e| e.message().to_string())?;
            
            let blob = repo
                .find_blob(entry.id())
                .map_err(|e| e.message().to_string())?;
            
            String::from_utf8(blob.content().to_vec())
                .map_err(|_| "File is not valid UTF-8".to_string())
        } else {
            let full_path = PathBuf::from(&worktree_path).join(&file_path);
            std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatusFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub staged: Vec<GitStatusFile>,
    pub unstaged: Vec<GitStatusFile>,
    pub branch: Option<String>,
    pub upstream_branch: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[tauri::command]
pub async fn get_git_status(worktree_path: String) -> Result<GitStatus, String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let mut staged: Vec<GitStatusFile> = Vec::new();
        let mut unstaged: Vec<GitStatusFile> = Vec::new();
        
        // Get status
        let statuses = repo
            .statuses(Some(
                git2::StatusOptions::new()
                    .include_untracked(true)
                    .recurse_untracked_dirs(true)
                    .include_ignored(false),
            ))
            .map_err(|e| e.message().to_string())?;
        
        for entry in statuses.iter() {
            // Skip entries with invalid UTF-8 paths
            let path = match entry.path() {
                Some(p) if !p.is_empty() => p.to_string(),
                _ => continue,
            };
            let status = entry.status();
            
            // Check staged changes (index)
            if status.intersects(
                git2::Status::INDEX_NEW
                    | git2::Status::INDEX_MODIFIED
                    | git2::Status::INDEX_DELETED
                    | git2::Status::INDEX_RENAMED
                    | git2::Status::INDEX_TYPECHANGE,
            ) {
                let status_str = if status.contains(git2::Status::INDEX_NEW) {
                    "added"
                } else if status.contains(git2::Status::INDEX_DELETED) {
                    "deleted"
                } else if status.contains(git2::Status::INDEX_RENAMED) {
                    "renamed"
                } else {
                    "modified"
                };
                staged.push(GitStatusFile {
                    path: path.clone(),
                    status: status_str.to_string(),
                    staged: true,
                });
            }
            
            // Check unstaged changes (worktree)
            if status.intersects(
                git2::Status::WT_NEW
                    | git2::Status::WT_MODIFIED
                    | git2::Status::WT_DELETED
                    | git2::Status::WT_RENAMED
                    | git2::Status::WT_TYPECHANGE,
            ) {
                let status_str = if status.contains(git2::Status::WT_NEW) {
                    "untracked"
                } else if status.contains(git2::Status::WT_DELETED) {
                    "deleted"
                } else if status.contains(git2::Status::WT_RENAMED) {
                    "renamed"
                } else {
                    "modified"
                };
                unstaged.push(GitStatusFile {
                    path,
                    status: status_str.to_string(),
                    staged: false,
                });
            }
        }
        
        // Get branch info
        let branch = repo.head().ok().and_then(|h| h.shorthand().map(String::from));
        
        let (upstream_branch, ahead, behind) = get_upstream_info(&repo)
            .map(|(name, ahead, behind)| (Some(name), ahead, behind))
            .unwrap_or((None, 0, 0));
        
        Ok::<GitStatus, String>(GitStatus {
            staged,
            unstaged,
            branch,
            upstream_branch,
            ahead,
            behind,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn get_upstream_info(repo: &Repository) -> Option<(String, usize, usize)> {
    let head = repo.head().ok()?;
    let local_oid = head.target()?;

    let branch_name = head.shorthand()?;
    let local_branch = repo.find_branch(branch_name, BranchType::Local).ok()?;
    let upstream_branch = local_branch.upstream().ok()?;
    let upstream_name = upstream_branch.name().ok()??;
    let upstream_oid = upstream_branch.get().target()?;

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid).ok()?;
    Some((upstream_name.to_string(), ahead, behind))
}

#[tauri::command]
pub async fn git_stage_files(worktree_path: String, files: Vec<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        
        for file in files {
            // Check if file exists - if not, it's a deletion
            let full_path = PathBuf::from(&worktree_path).join(&file);
            if full_path.exists() {
                index
                    .add_path(std::path::Path::new(&file))
                    .map_err(|e| format!("Failed to stage {}: {}", file, e.message()))?;
            } else {
                index
                    .remove_path(std::path::Path::new(&file))
                    .map_err(|e| format!("Failed to stage deletion {}: {}", file, e.message()))?;
            }
        }
        
        index.write().map_err(|e| e.message().to_string())?;
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_unstage_files(worktree_path: String, files: Vec<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let head = repo.head().map_err(|e| e.message().to_string())?;
        let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
        let head_tree = head_commit.tree().map_err(|e| e.message().to_string())?;
        
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        
        for file in files {
            let path = std::path::Path::new(&file);
            
            // Check if file exists in HEAD
            if let Ok(entry) = head_tree.get_path(path) {
                // File exists in HEAD, restore it from HEAD
                let blob = repo.find_blob(entry.id()).map_err(|e| e.message().to_string())?;
                index
                    .add(&git2::IndexEntry {
                        ctime: git2::IndexTime::new(0, 0),
                        mtime: git2::IndexTime::new(0, 0),
                        dev: 0,
                        ino: 0,
                        mode: entry.filemode() as u32,
                        uid: 0,
                        gid: 0,
                        file_size: blob.size() as u32,
                        id: entry.id(),
                        flags: 0,
                        flags_extended: 0,
                        path: file.as_bytes().to_vec(),
                    })
                    .map_err(|e| format!("Failed to unstage {}: {}", file, e.message()))?;
            } else {
                // File doesn't exist in HEAD (was newly added), remove from index
                index
                    .remove_path(path)
                    .map_err(|e| format!("Failed to unstage {}: {}", file, e.message()))?;
            }
        }
        
        index.write().map_err(|e| e.message().to_string())?;
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_commit(worktree_path: String, message: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
        let tree = repo.find_tree(tree_oid).map_err(|e| e.message().to_string())?;
        
        let signature = repo.signature().map_err(|e| e.message().to_string())?;
        
        // Handle initial commit (unborn HEAD) vs normal commit
        let commit_oid = match repo.head() {
            Ok(head) => {
                let parent_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
                repo.commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    &message,
                    &tree,
                    &[&parent_commit],
                )
                .map_err(|e| e.message().to_string())?
            }
            Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {
                // Initial commit - no parent
                repo.commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    &message,
                    &tree,
                    &[],
                )
                .map_err(|e| e.message().to_string())?
            }
            Err(e) => return Err(e.message().to_string()),
        };
        
        Ok::<String, String>(commit_oid.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_push(worktree_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .args(["push"])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("Failed to run git push: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git push failed: {}", stderr));
        }

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stage_all(worktree_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&worktree_path).map_err(|e| e.message().to_string())?;
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(|e| e.message().to_string())?;
        
        // Also handle deletions
        index
            .update_all(["*"].iter(), None)
            .map_err(|e| e.message().to_string())?;
        
        index.write().map_err(|e| e.message().to_string())?;
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_unstage_all(worktree_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .args(["reset"])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("Failed to run git reset: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git reset failed: {}", stderr));
        }

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn generate_commit_message(
    worktree_path: String,
    agent: String,
) -> Result<String, String> {
    let agent_cmd = find_cli_tool(&agent)?;

    tokio::task::spawn_blocking(move || {
        let prompt = "Look at my staged changes (use git diff --cached) and generate a concise commit message. Return ONLY the commit message wrapped in XML tags like <commit_message>your message here</commit_message>. No other text.";

        let output = match agent.as_str() {
            "opencode" => {
                Command::new(&agent_cmd)
                    .args(["run", prompt])
                    .current_dir(&worktree_path)
                    .output()
                    .map_err(|e| format!("Failed to run {}: {}", agent, e))?
            }
            "claude" => {
                Command::new(&agent_cmd)
                    .args([
                        "-p", prompt,
                        "--allowedTools", "Bash(git diff:*),Bash(git status:*)"
                    ])
                    .current_dir(&worktree_path)
                    .output()
                    .map_err(|e| format!("Failed to run {}: {}", agent, e))?
            }
            "aider" => {
                Command::new(&agent_cmd)
                    .args(["--message", prompt, "--yes"])
                    .current_dir(&worktree_path)
                    .output()
                    .map_err(|e| format!("Failed to run {}: {}", agent, e))?
            }
            _ => {
                Command::new(&agent_cmd)
                    .args(["run", prompt])
                    .current_dir(&worktree_path)
                    .output()
                    .map_err(|e| format!("Failed to run {}: {}", agent, e))?
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("{} failed: {}", agent, stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        // Primary: XML tags (most reliable)
        let xml_re = Regex::new(r"(?s)<commit_message>\s*(.*?)\s*</commit_message>").map_err(|e| e.to_string())?;
        if let Some(captures) = xml_re.captures(&stdout) {
            if let Some(message) = captures.get(1) {
                let msg = message.as_str().trim();
                if !msg.is_empty() {
                    return Ok(msg.to_string());
                }
            }
        }

        // Fallback: square brackets (legacy compatibility)
        let bracket_re = Regex::new(r"\[([^\]]+)\]").map_err(|e| e.to_string())?;
        if let Some(captures) = bracket_re.captures(&stdout) {
            if let Some(message) = captures.get(1) {
                let msg = message.as_str().trim();
                if !msg.is_empty() {
                    return Ok(msg.to_string());
                }
            }
        }

        // Last resort: last non-empty line
        let lines: Vec<&str> = stdout.lines()
            .filter(|l| !l.trim().is_empty())
            .collect();

        if let Some(last_line) = lines.last() {
            return Ok(last_line.trim().to_string());
        }

        Err("Could not extract commit message from AI response".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
