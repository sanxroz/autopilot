use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use tauri::{AppHandle, Manager};

const LAUNCHER_DIR_NAME: &str = ".local/bin";
const PATH_BLOCK_MARKER: &str = "# AUTOPILOT PATH";

#[cfg(not(target_os = "windows"))]
const LAUNCHER_NAME: &str = "autopilot";

#[cfg(target_os = "windows")]
const LAUNCHER_NAME: &str = "autopilot.cmd";

const NOTE_SCRIPT_NAME: &str = "autopilot-note.mjs";

pub fn install_cli_launcher(app: &AppHandle) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "home directory unavailable".to_string())?;
    let launcher_dir = home_dir.join(LAUNCHER_DIR_NAME);
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let cli_dir = app_data_dir.join("cli");
    let note_script_path = cli_dir.join(NOTE_SCRIPT_NAME);
    let launcher_path = launcher_dir.join(LAUNCHER_NAME);

    fs::create_dir_all(&cli_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&launcher_dir).map_err(|error| error.to_string())?;

    write_file_if_changed(
        &note_script_path,
        include_str!("../../../scripts/autopilot-note.mjs"),
    )
    .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    {
        write_file_if_changed(&launcher_path, &build_windows_launcher(&note_script_path))
            .map_err(|error| error.to_string())?;
        ensure_windows_path_contains(&launcher_dir)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        write_file_if_changed(&launcher_path, &build_unix_launcher(&note_script_path))
            .map_err(|error| error.to_string())?;
        set_executable(&launcher_path).map_err(|error| error.to_string())?;
        ensure_unix_path_contains(&launcher_dir)?;
    }

    Ok(())
}

fn write_file_if_changed(path: &Path, contents: &str) -> Result<(), std::io::Error> {
    match fs::read_to_string(path) {
        Ok(existing) if existing == contents => Ok(()),
        Ok(_) => fs::write(path, contents),
        Err(error) if error.kind() == ErrorKind::NotFound => fs::write(path, contents),
        Err(error) => Err(error),
    }
}

fn build_unix_launcher(note_script_path: &Path) -> String {
    format!(
        r#"#!/bin/sh
set -eu

case "${{1:-}}" in
  note)
    shift
    exec bun run "{}" "$@"
    ;;
  --help|-h|help|"")
    cat <<'EOF'
Usage:
  autopilot note [--worktree <path>] set --text <markdown>
  autopilot note [--worktree <path>] set --stdin
  autopilot note [--worktree <path>] get
  autopilot note [--worktree <path>] clear
EOF
    ;;
  *)
    printf 'Unknown autopilot command: %s\n' "$1" >&2
    exit 1
    ;;
esac
"#,
        note_script_path.display()
    )
}

#[cfg(target_os = "windows")]
fn build_windows_launcher(note_script_path: &Path) -> String {
    format!(
        r#"@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_PATH={}"

if /I "%~1"=="note" goto note

if /I "%~1"=="--help" goto help
if /I "%~1"=="-h" goto help
if /I "%~1"=="help" goto help
if "%~1"=="" goto help

echo Unknown autopilot command: %~1 1>&2
exit /b 1

:note
shift
set "ARGS="
:collect_args
if "%~1"=="" goto run_note
if defined ARGS (
  set "ARGS=!ARGS! "%~1""
) else (
  set "ARGS="%~1""
)
shift
goto collect_args

:run_note
bun run "%SCRIPT_PATH%" !ARGS!
exit /b %ERRORLEVEL%

:help
echo Usage:
echo   autopilot note [--worktree ^<path^>] set --text ^<markdown^>
echo   autopilot note [--worktree ^<path^>] set --stdin
echo   autopilot note [--worktree ^<path^>] get
echo   autopilot note [--worktree ^<path^>] clear
exit /b 0
"#,
        note_script_path.display(),
    )
}

#[cfg(not(target_os = "windows"))]
fn set_executable(path: &Path) -> Result<(), std::io::Error> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = fs::metadata(path)?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
}

#[cfg(target_os = "windows")]
fn ensure_windows_path_contains(launcher_dir: &Path) -> Result<(), String> {
    let launcher_dir_str = launcher_dir.display().to_string();
    let existing = read_windows_user_path().map_err(|error| error.to_string())?;

    if path_contains_entry(&existing, &launcher_dir_str) {
        return Ok(());
    }

    let next = if existing.is_empty() {
        launcher_dir_str
    } else {
        format!("{existing};{launcher_dir_str}")
    };

    write_windows_user_path(&next).map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn read_windows_user_path() -> Result<String, std::io::Error> {
    use std::process::Command;

    let output = Command::new("reg")
        .args(["query", r"HKCU\Environment", "/v", "Path"])
        .output()?;

    if !output.status.success() {
        return Ok(String::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some((_, value)) = trimmed.split_once("REG_EXPAND_SZ") {
            return Ok(value.trim().to_string());
        }
        if let Some((_, value)) = trimmed.split_once("REG_SZ") {
            return Ok(value.trim().to_string());
        }
    }

    Ok(String::new())
}

#[cfg(target_os = "windows")]
fn write_windows_user_path(path_value: &str) -> Result<(), std::io::Error> {
    use std::process::Command;

    let status = Command::new("reg")
        .args([
            "add",
            r"HKCU\Environment",
            "/v",
            "Path",
            "/t",
            "REG_EXPAND_SZ",
            "/d",
            path_value,
            "/f",
        ])
        .status()?;

    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other("failed to update user PATH"))
    }
}

#[cfg(any(test, target_os = "windows"))]
fn path_contains_entry(path_value: &str, entry: &str) -> bool {
    path_value
        .split(';')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .any(|segment| segment.eq_ignore_ascii_case(entry))
}

#[cfg(not(target_os = "windows"))]
fn ensure_unix_path_contains(launcher_dir: &Path) -> Result<(), String> {
    let launcher_dir_str = launcher_dir.display().to_string();
    let home_dir = dirs::home_dir().ok_or_else(|| "home directory unavailable".to_string())?;
    let path_files = [
        home_dir.join(".profile"),
        home_dir.join(".bashrc"),
        home_dir.join(".zprofile"),
        home_dir.join(".zshrc"),
    ];
    let path_block = format!(
        "\n{marker}\ncase \":${{PATH:-}}:\" in\n  *\":{launcher_dir}:\"*) ;;\n  *) export PATH=\"{launcher_dir}:$PATH\" ;;\nesac\n{marker}\n",
        marker = PATH_BLOCK_MARKER,
        launcher_dir = launcher_dir_str
    );

    for path_file in path_files {
        append_block_if_missing(&path_file, &path_block).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn append_block_if_missing(path: &Path, block: &str) -> Result<(), std::io::Error> {
    let existing = match fs::read_to_string(path) {
        Ok(existing) => existing,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error),
    };

    if existing.contains(PATH_BLOCK_MARKER) {
        return Ok(());
    }

    let next = if existing.is_empty() {
        block.trim_start_matches('\n').to_string()
    } else {
        format!("{existing}{block}")
    };

    fs::write(path, next)
}

#[cfg(test)]
mod tests {
    #[cfg(not(target_os = "windows"))]
    use std::fs;
    #[cfg(not(target_os = "windows"))]
    use std::io::ErrorKind;
    #[cfg(target_os = "windows")]
    use std::path::Path;
    #[cfg(not(target_os = "windows"))]
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(not(target_os = "windows"))]
    use super::append_block_if_missing;
    #[cfg(target_os = "windows")]
    use super::build_windows_launcher;
    use super::path_contains_entry;

    #[cfg(not(target_os = "windows"))]
    fn make_temp_dir() -> std::path::PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "autopilot-cli-launcher-test-{}-{unique_suffix}",
            std::process::id()
        ));
        fs::create_dir(&path).expect("temp dir");
        path
    }

    #[test]
    fn path_contains_entry_ignores_case_and_spacing() {
        assert!(path_contains_entry(
            r"C:\Users\me\.local\bin;C:\Windows\System32",
            r"c:\users\me\.LOCAL\BIN"
        ));
    }

    #[test]
    fn path_contains_entry_returns_false_when_missing() {
        assert!(!path_contains_entry(
            r"/usr/bin:/bin",
            r"/home/me/.local/bin"
        ));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_launcher_places_labels_outside_the_note_condition() {
        let script = build_windows_launcher(Path::new(
            r"C:\Users\me\AppData\Roaming\autopilot\cli\autopilot-note.mjs",
        ));

        assert!(script.contains("if /I \"%~1\"==\"note\" goto note"));
        assert!(script.contains("\n:note\nshift\nset \"ARGS=\"\n:collect_args\n"));
        assert!(!script.contains("if /I \"%~1\"==\"note\" (\n"));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn append_block_if_missing_creates_a_missing_profile_file() {
        let temp_dir = make_temp_dir();
        let profile_path = temp_dir.join(".profile");

        append_block_if_missing(
            &profile_path,
            "\n# AUTOPILOT PATH\nexport PATH=\"/tmp/bin:$PATH\"\n",
        )
        .expect("missing profile should be created");

        let contents = fs::read_to_string(profile_path).expect("profile contents");
        assert_eq!(
            contents,
            "# AUTOPILOT PATH\nexport PATH=\"/tmp/bin:$PATH\"\n"
        );
        fs::remove_dir_all(temp_dir).expect("cleanup temp dir");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn append_block_if_missing_returns_read_errors_instead_of_clobbering() {
        let temp_dir = make_temp_dir();
        let error = append_block_if_missing(
            &temp_dir,
            "\n# AUTOPILOT PATH\nexport PATH=\"/tmp/bin:$PATH\"\n",
        )
        .expect_err("directory reads should fail");

        assert_eq!(error.kind(), ErrorKind::IsADirectory);
        fs::remove_dir_all(temp_dir).expect("cleanup temp dir");
    }
}
