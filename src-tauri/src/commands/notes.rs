use git2::Repository;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

const CONTEXT_FILE_NAME: &str = ".autopilot.md";
const CONTEXT_IGNORE_RULES: [&str; 2] = ["/.autopilot.md", "/.autopilot.*.tmp"];
const MAX_CONTEXT_BYTES: u64 = 1_000_000;
const SUMMARY_READ_BYTES: usize = 8 * 1024;
const SUMMARY_PREVIEW_CHARS: usize = 160;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeContextSummary {
    pub preview: String,
    pub updated_at: Option<u64>,
    pub has_more: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeContextSummaryResult {
    pub summary: Option<WorktreeContextSummary>,
    pub error: Option<String>,
}

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

pub fn initialize_autopilot_context(worktree_path: &str) -> Result<(), String> {
    let context_path = prepare_autopilot_context(worktree_path)?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(context_path)
        .map_err(|error| error.to_string())?;
    Ok(())
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

    match fs::read_to_string(context_path) {
        Ok(markdown) => Ok(!markdown.trim().is_empty()),
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

fn truncate_preview(line: &str) -> (String, bool) {
    let mut chars = line.chars();
    let preview: String = chars.by_ref().take(SUMMARY_PREVIEW_CHARS).collect();
    (preview, chars.next().is_some())
}

fn is_horizontal_rule(line: &str) -> bool {
    let mut chars = line.chars().filter(|character| !character.is_whitespace());
    let Some(first) = chars.next() else {
        return false;
    };
    matches!(first, '-' | '*' | '_') && chars.all(|character| character == first)
}

fn is_empty_list_marker(line: &str) -> bool {
    let Some(marker) = line.chars().next() else {
        return false;
    };
    matches!(marker, '-' | '*' | '+') && line[marker.len_utf8()..].trim().is_empty()
}

fn extract_context_preview(markdown: &str, source_has_more: bool) -> (String, bool) {
    let mut lines = markdown.lines();
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with('#')
            || is_horizontal_rule(trimmed)
            || is_empty_list_marker(trimmed)
        {
            continue;
        }

        let collapsed = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
        let (preview, line_has_more) = truncate_preview(&collapsed);
        let has_later_content = lines.any(|line| !line.trim().is_empty());
        return (
            preview,
            source_has_more || line_has_more || has_later_content,
        );
    }

    (String::new(), source_has_more)
}

fn read_context_summary(worktree_path: &str) -> Result<WorktreeContextSummary, String> {
    let worktree_path = validate_worktree(worktree_path)?;
    let context_path = worktree_path.join(CONTEXT_FILE_NAME);
    let metadata = match fs::metadata(&context_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(WorktreeContextSummary {
                preview: String::new(),
                updated_at: None,
                has_more: false,
            });
        }
        Err(error) => return Err(error.to_string()),
    };

    if metadata.len() == 0 {
        return Ok(WorktreeContextSummary {
            preview: String::new(),
            updated_at: None,
            has_more: false,
        });
    }

    let updated_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);
    let mut file = fs::File::open(&context_path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::with_capacity(SUMMARY_READ_BYTES + 1);
    Read::by_ref(&mut file)
        .take((SUMMARY_READ_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    let source_has_more = bytes.len() > SUMMARY_READ_BYTES;
    let mut prefix_end = bytes.len().min(SUMMARY_READ_BYTES);
    if let Err(error) = std::str::from_utf8(&bytes[..prefix_end]) {
        if error.error_len().is_some() {
            return Err(format!(".autopilot.md is not valid UTF-8: {error}"));
        }
        while prefix_end > 0 && std::str::from_utf8(&bytes[..prefix_end]).is_err() {
            prefix_end -= 1;
        }
    }
    let prefix = std::str::from_utf8(&bytes[..prefix_end])
        .map_err(|error| format!(".autopilot.md is not valid UTF-8: {error}"))?;
    let (preview, has_more) = extract_context_preview(prefix, source_has_more);

    Ok(WorktreeContextSummary {
        preview,
        updated_at,
        has_more,
    })
}

#[tauri::command]
pub fn read_autopilot_context_summaries(
    worktree_paths: Vec<String>,
) -> std::collections::HashMap<String, WorktreeContextSummaryResult> {
    worktree_paths
        .into_iter()
        .map(|worktree_path| {
            let result = match read_context_summary(&worktree_path) {
                Ok(summary) => WorktreeContextSummaryResult {
                    summary: Some(summary),
                    error: None,
                },
                Err(error) => WorktreeContextSummaryResult {
                    summary: None,
                    error: Some(error),
                },
            };
            (worktree_path, result)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static REPOSITORY_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn make_repository() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = REPOSITORY_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "autopilot-notes-{}-{suffix}-{counter}",
            std::process::id()
        ));
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
    fn initializes_context_without_overwriting_existing_content() {
        let repository = make_repository();
        let worktree_path = repository.to_string_lossy().to_string();
        let context_path = repository.join(CONTEXT_FILE_NAME);

        initialize_autopilot_context(&worktree_path).unwrap();
        assert_eq!(fs::read_to_string(&context_path).unwrap(), "");

        fs::write(&context_path, "# Existing context\n").unwrap();
        initialize_autopilot_context(&worktree_path).unwrap();
        assert_eq!(
            fs::read_to_string(&context_path).unwrap(),
            "# Existing context\n"
        );

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

        fs::write(
            repository.join(CONTEXT_FILE_NAME),
            vec![b' '; MAX_CONTEXT_BYTES as usize + 1],
        )
        .unwrap();
        assert!(!has_autopilot_context(repository.to_string_lossy().to_string()).unwrap());

        fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn extracts_bounded_context_previews_without_structural_markdown() {
        let markdown = "# Goal\n\n---\n-\n\n  The   next action is   ship the résumé safely.\n";
        assert_eq!(
            extract_context_preview(markdown, false),
            (
                "The next action is ship the résumé safely.".to_string(),
                false
            )
        );

        let long_line = "é".repeat(SUMMARY_PREVIEW_CHARS + 4);
        let (preview, has_more) = extract_context_preview(&long_line, false);
        assert_eq!(preview.chars().count(), SUMMARY_PREVIEW_CHARS);
        assert!(has_more);
        assert!(preview.chars().all(|character| character == 'é'));

        assert_eq!(
            extract_context_preview("First action\n\nSecond action\n", false),
            ("First action".to_string(), true)
        );
    }

    #[test]
    fn summaries_isolate_invalid_worktrees_and_preserve_missing_results() {
        let repository = make_repository();
        let existing = repository.to_string_lossy().to_string();
        write_autopilot_context(existing.clone(), "# Heading\n\nDo the work\n".to_string())
            .unwrap();

        let missing = repository.join("missing").to_string_lossy().to_string();
        let summaries = read_autopilot_context_summaries(vec![existing.clone(), missing.clone()]);
        assert_eq!(
            summaries[&existing].summary.as_ref().unwrap().preview,
            "Do the work"
        );
        assert!(summaries[&existing].error.is_none());
        assert!(summaries[&missing].summary.is_none());
        assert!(summaries[&missing].error.is_some());

        let absent_context = make_repository();
        let absent_path = absent_context.to_string_lossy().to_string();
        let absent = read_autopilot_context_summaries(vec![absent_path.clone()]);
        assert_eq!(absent[&absent_path].summary.as_ref().unwrap().preview, "");
        assert!(absent[&absent_path]
            .summary
            .as_ref()
            .unwrap()
            .updated_at
            .is_none());

        fs::write(absent_context.join(CONTEXT_FILE_NAME), "").unwrap();
        let empty = read_autopilot_context_summaries(vec![absent_path.clone()]);
        assert!(empty[&absent_path]
            .summary
            .as_ref()
            .unwrap()
            .updated_at
            .is_none());

        fs::write(absent_context.join(CONTEXT_FILE_NAME), [b'o', 0xff, b'k']).unwrap();
        let malformed = read_autopilot_context_summaries(vec![absent_path.clone()]);
        assert!(malformed[&absent_path].summary.is_none());
        assert!(malformed[&absent_path].error.is_some());

        fs::remove_dir_all(repository).unwrap();
        fs::remove_dir_all(absent_context).unwrap();
    }
}
