use git2::Repository;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

const CONTEXT_FILE_NAME: &str = ".autopilot.md";
const CONTEXT_IGNORE_RULES: [&str; 2] = ["/.autopilot.md", "/.autopilot.*.tmp"];
const MAX_CONTEXT_BYTES: u64 = 1_000_000;

fn validate_worktree(worktree_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(worktree_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let repository = Repository::open(&path).map_err(|error| error.message().to_string())?;
    let repository_root = repository
        .workdir()
        .ok_or_else(|| "Bare repositories do not have Autopilot notes".to_string())?
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if repository_root != path {
        return Err("Notes path must be a Git worktree root".to_string());
    }

    Ok(path)
}

fn ensure_context_is_ignored(worktree_path: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .args([
            "-C",
            &worktree_path.to_string_lossy(),
            "rev-parse",
            "--git-path",
            "info/exclude",
        ])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let raw_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let exclude_path = PathBuf::from(&raw_path);
    let exclude_path = if exclude_path.is_absolute() {
        exclude_path
    } else {
        worktree_path.join(exclude_path)
    };
    let existing = match fs::read_to_string(&exclude_path) {
        Ok(existing) => existing,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let missing_rules: Vec<&str> = CONTEXT_IGNORE_RULES
        .iter()
        .copied()
        .filter(|rule| !existing.lines().any(|line| line.trim() == *rule))
        .collect();
    if missing_rules.is_empty() {
        return Ok(());
    }

    if let Some(parent) = exclude_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&exclude_path)
        .map_err(|error| error.to_string())?;
    if !existing.is_empty() && !existing.ends_with('\n') {
        writeln!(file).map_err(|error| error.to_string())?;
    }
    for rule in missing_rules {
        writeln!(file, "{rule}").map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn prepare_autopilot_context(worktree_path: &str) -> Result<PathBuf, String> {
    let worktree_path = validate_worktree(worktree_path)?;
    ensure_context_is_ignored(&worktree_path)?;
    Ok(worktree_path.join(CONTEXT_FILE_NAME))
}

#[tauri::command]
pub fn read_autopilot_context(worktree_path: String) -> Result<String, String> {
    let context_path = prepare_autopilot_context(&worktree_path)?;

    match fs::metadata(&context_path) {
        Ok(metadata) if metadata.len() > MAX_CONTEXT_BYTES => {
            Err(".autopilot.md is larger than 1 MB".to_string())
        }
        Ok(_) => fs::read_to_string(context_path).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn has_autopilot_context(worktree_path: String) -> Result<bool, String> {
    let context_path = validate_worktree(&worktree_path)?.join(CONTEXT_FILE_NAME);

    match fs::metadata(&context_path) {
        Ok(metadata) if metadata.len() > MAX_CONTEXT_BYTES => Ok(true),
        Ok(_) => fs::read_to_string(context_path)
            .map(|markdown| !markdown.trim().is_empty())
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn write_autopilot_context(worktree_path: String, markdown: String) -> Result<(), String> {
    if markdown.len() as u64 > MAX_CONTEXT_BYTES {
        return Err(".autopilot.md cannot be larger than 1 MB".to_string());
    }

    let context_path = prepare_autopilot_context(&worktree_path)?;
    let worktree_path = context_path
        .parent()
        .ok_or_else(|| "Autopilot context path has no parent".to_string())?;
    let mut temporary_file = tempfile::Builder::new()
        .prefix(".autopilot.")
        .suffix(".tmp")
        .tempfile_in(worktree_path)
        .map_err(|error| error.to_string())?;
    temporary_file
        .write_all(markdown.as_bytes())
        .map_err(|error| error.to_string())?;
    temporary_file
        .persist(context_path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_repository() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("autopilot-notes-{}-{suffix}", std::process::id()));
        fs::create_dir(&path).unwrap();
        Repository::init(&path).unwrap();
        path
    }

    #[test]
    fn reads_and_atomically_replaces_worktree_context() {
        let repository = make_repository();
        let worktree_path = repository.to_string_lossy().to_string();

        assert!(!has_autopilot_context(worktree_path.clone()).unwrap());
        assert_eq!(read_autopilot_context(worktree_path.clone()).unwrap(), "");
        write_autopilot_context(worktree_path.clone(), "# Current work\n".to_string()).unwrap();
        assert!(has_autopilot_context(worktree_path.clone()).unwrap());
        assert_eq!(
            read_autopilot_context(worktree_path.clone()).unwrap(),
            "# Current work\n"
        );
        write_autopilot_context(worktree_path.clone(), "# Next work\n".to_string()).unwrap();
        assert_eq!(
            read_autopilot_context(worktree_path).unwrap(),
            "# Next work\n"
        );
        let exclude = fs::read_to_string(repository.join(".git/info/exclude")).unwrap();
        for rule in CONTEXT_IGNORE_RULES {
            assert_eq!(exclude.lines().filter(|line| *line == rule).count(), 1);
        }
        assert!(Command::new("git")
            .args([
                "-C",
                &repository.to_string_lossy(),
                "check-ignore",
                CONTEXT_FILE_NAME
            ])
            .output()
            .unwrap()
            .status
            .success());

        fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn rejects_paths_below_the_worktree_root() {
        let repository = make_repository();
        let nested = repository.join("nested");
        fs::create_dir(&nested).unwrap();

        assert!(read_autopilot_context(nested.to_string_lossy().to_string()).is_err());
        assert!(!repository.join(CONTEXT_FILE_NAME).exists());

        fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn rejects_context_larger_than_one_megabyte() {
        let repository = make_repository();
        let worktree_path = repository.to_string_lossy().to_string();
        let oversized = "x".repeat(MAX_CONTEXT_BYTES as usize + 1);

        let write_error = write_autopilot_context(worktree_path.clone(), oversized).unwrap_err();
        assert_eq!(write_error, ".autopilot.md cannot be larger than 1 MB");
        assert!(!repository.join(CONTEXT_FILE_NAME).exists());

        fs::write(
            repository.join(CONTEXT_FILE_NAME),
            vec![b'x'; MAX_CONTEXT_BYTES as usize + 1],
        )
        .unwrap();
        let read_error = read_autopilot_context(worktree_path).unwrap_err();
        assert_eq!(read_error, ".autopilot.md is larger than 1 MB");
        assert!(has_autopilot_context(repository.to_string_lossy().to_string()).unwrap());

        fs::remove_dir_all(repository).unwrap();
    }
}
