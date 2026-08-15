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
const GROUP_SCRIPT_NAME: &str = "autopilot-group.mjs";
const SETTINGS_SCRIPT_NAME: &str = "autopilot-settings.mjs";
const RECOVER_SCRIPT_NAME: &str = "autopilot-recover.mjs";

pub fn install_cli_launcher(app: &AppHandle) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "home directory unavailable".to_string())?;
    let launcher_dir = home_dir.join(LAUNCHER_DIR_NAME);
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let cli_dir = app_data_dir.join("cli");
    let note_script_path = cli_dir.join(NOTE_SCRIPT_NAME);
    let group_script_path = cli_dir.join(GROUP_SCRIPT_NAME);
    let settings_script_path = cli_dir.join(SETTINGS_SCRIPT_NAME);
    let launcher_path = launcher_dir.join(LAUNCHER_NAME);

    fs::create_dir_all(&cli_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&launcher_dir).map_err(|error| error.to_string())?;
    remove_legacy_launcher(&launcher_path, &note_script_path).map_err(|error| error.to_string())?;
    remove_file_if_present(&note_script_path).map_err(|error| error.to_string())?;
    write_file_if_changed(
        &group_script_path,
        include_str!("../../../scripts/autopilot-group.mjs"),
    )
    .map_err(|error| error.to_string())?;
    write_file_if_changed(
        &settings_script_path,
        include_str!("../../../scripts/autopilot-settings.mjs"),
    )
    .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let recover_script_path = cli_dir.join(RECOVER_SCRIPT_NAME);
        write_file_if_changed(
            &recover_script_path,
            include_str!("../../../scripts/autopilot-recover.mjs"),
        )
        .map_err(|error| error.to_string())?;
        write_file_if_changed(
            &launcher_path,
            &build_unix_launcher(&group_script_path, Some(&recover_script_path)),
        )
        .map_err(|error| error.to_string())?;
        set_executable(&launcher_path).map_err(|error| error.to_string())?;
        ensure_unix_path_contains(&launcher_dir)?;
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        write_file_if_changed(
            &launcher_path,
            &build_unix_launcher(&group_script_path, None),
        )
        .map_err(|error| error.to_string())?;
        set_executable(&launcher_path).map_err(|error| error.to_string())?;
        ensure_unix_path_contains(&launcher_dir)?;
    }

    #[cfg(target_os = "windows")]
    {
        write_file_if_changed(&launcher_path, &build_windows_launcher(&group_script_path))
            .map_err(|error| error.to_string())?;
        ensure_windows_path_contains(&launcher_dir)?;
    }

    Ok(())
}

fn remove_file_if_present(path: &Path) -> Result<(), std::io::Error> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn remove_legacy_launcher(path: &Path, note_script_path: &Path) -> Result<(), std::io::Error> {
    let contents = match fs::read(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if is_legacy_launcher(&contents, note_script_path) {
        remove_file_if_present(path)?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn is_legacy_launcher(contents: &[u8], note_script_path: &Path) -> bool {
    contents == build_legacy_unix_launcher(note_script_path).as_bytes()
}

#[cfg(target_os = "windows")]
fn is_legacy_launcher(contents: &[u8], note_script_path: &Path) -> bool {
    is_legacy_windows_launcher(contents, note_script_path)
}

#[cfg(any(test, target_os = "windows"))]
fn is_legacy_windows_launcher(contents: &[u8], note_script_path: &Path) -> bool {
    contents == build_legacy_windows_launcher(note_script_path, false).as_bytes()
        || contents == build_legacy_windows_launcher(note_script_path, true).as_bytes()
}

#[cfg(not(target_os = "windows"))]
fn build_legacy_unix_launcher(note_script_path: &Path) -> String {
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

#[cfg(any(test, target_os = "windows"))]
fn build_legacy_windows_launcher(note_script_path: &Path, original: bool) -> String {
    let note_route = if original {
        r#"if /I "%~1"=="note" (
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
)
"#
    } else {
        r#"if /I "%~1"=="note" goto note
"#
    };
    let note_handler = if original {
        ""
    } else {
        r#":note
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

"#
    };

    format!(
        r#"@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_PATH={}"

{}
if /I "%~1"=="--help" goto help
if /I "%~1"=="-h" goto help
if /I "%~1"=="help" goto help
if "%~1"=="" goto help

echo Unknown autopilot command: %~1 1>&2
exit /b 1

{}:run_note
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
        note_route,
        note_handler,
    )
}

fn write_file_if_changed(path: &Path, contents: &str) -> Result<(), std::io::Error> {
    match fs::read_to_string(path) {
        Ok(existing) if existing == contents => Ok(()),
        Ok(_) => fs::write(path, contents),
        Err(error) if error.kind() == ErrorKind::NotFound => fs::write(path, contents),
        Err(error) => Err(error),
    }
}

fn build_unix_launcher(group_script_path: &Path, recover_script_path: Option<&Path>) -> String {
    let (recover_route, recover_usage) = match recover_script_path {
        Some(path) => (
            format!(
                r#"  recover)
    shift
    exec bun run "{}" "$@"
    ;;
"#,
                path.display()
            ),
            "  autopilot recover [--list]\n",
        ),
        None => (String::new(), ""),
    };

    format!(
        r#"#!/bin/sh
set -eu

case "${{1:-}}" in
  group)
    shift
    exec bun run "{}" "$@"
    ;;
{}  --help|-h|help|"")
    cat <<'EOF'
Usage:
  autopilot group [--worktree <path>] set <name>
  autopilot group [--worktree <path>] get
  autopilot group [--worktree <path>] clear
{}
EOF
    ;;
  *)
    printf 'Unknown autopilot command: %s\n' "$1" >&2
    exit 1
    ;;
esac
"#,
        group_script_path.display(),
        recover_route,
        recover_usage,
    )
}

#[cfg(any(test, target_os = "windows"))]
fn build_windows_launcher(group_script_path: &Path) -> String {
    format!(
        r#"@echo off
setlocal EnableExtensions EnableDelayedExpansion

if /I "%~1"=="group" goto group
if /I "%~1"=="--help" goto help
if /I "%~1"=="-h" goto help
if /I "%~1"=="help" goto help
if "%~1"=="" goto help

echo Unknown autopilot command: %~1 1>&2
exit /b 1

:group
shift
set "ARGS="
:collect_group_args
if "%~1"=="" goto run_group
if defined ARGS (
  set "ARGS=!ARGS! "%~1""
) else (
  set "ARGS="%~1""
)
shift
goto collect_group_args

:run_group
bun run "{}" !ARGS!
exit /b %ERRORLEVEL%

:help
echo Usage:
echo   autopilot group [--worktree ^<path^>] set ^<name^>
echo   autopilot group [--worktree ^<path^>] get
echo   autopilot group [--worktree ^<path^>] clear
exit /b 0
"#,
        group_script_path.display(),
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
    let launcher_dir = launcher_dir.display().to_string();
    let existing = read_windows_user_path().map_err(|error| error.to_string())?;
    if path_contains_entry(&existing, &launcher_dir) {
        return Ok(());
    }

    let next = if existing.is_empty() {
        launcher_dir
    } else {
        format!("{existing};{launcher_dir}")
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
    let home_dir = dirs::home_dir().ok_or_else(|| "home directory unavailable".to_string())?;
    let path_files = [
        home_dir.join(".profile"),
        home_dir.join(".bashrc"),
        home_dir.join(".zprofile"),
        home_dir.join(".zshrc"),
    ];
    let path_block = unix_path_block(launcher_dir);

    for path_file in path_files {
        append_block_if_missing(&path_file, &path_block).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn unix_path_block(launcher_dir: &Path) -> String {
    format!(
        "\n{marker}\ncase \":${{PATH:-}}:\" in\n  *\":{launcher_dir}:\"*) ;;\n  *) export PATH=\"{launcher_dir}:$PATH\" ;;\nesac\n{marker}\n",
        marker = PATH_BLOCK_MARKER,
        launcher_dir = launcher_dir.display()
    )
}

#[cfg(not(target_os = "windows"))]
fn remove_block_if_present(path: &Path, block: &str) -> Result<(), std::io::Error> {
    let existing = match fs::read_to_string(path) {
        Ok(existing) => existing,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let without_block = existing.replace(block, "");
    let without_block = without_block.replace(block.trim_start_matches('\n'), "");
    if without_block != existing {
        fs::write(path, without_block)?;
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
    use std::fs;
    #[cfg(not(target_os = "windows"))]
    use std::io::ErrorKind;
    use std::path::Path;

    #[cfg(not(target_os = "windows"))]
    use super::{
        append_block_if_missing, build_legacy_unix_launcher, build_unix_launcher,
        remove_block_if_present, unix_path_block,
    };
    use super::{
        build_legacy_windows_launcher, build_windows_launcher, is_legacy_windows_launcher,
        path_contains_entry, remove_file_if_present, remove_legacy_launcher,
    };

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_launcher_routes_groups_and_recovery() {
        let launcher = build_unix_launcher(
            Path::new("/tmp/autopilot-group.mjs"),
            Some(Path::new("/tmp/autopilot-recover.mjs")),
        );

        assert!(launcher.contains("group)\n    shift\n    exec bun run"));
        assert!(launcher.contains("/tmp/autopilot-group.mjs"));
        assert!(launcher.contains("autopilot group [--worktree <path>] set <name>"));
        assert!(launcher.contains("recover)\n    shift\n    exec bun run"));
        assert!(launcher.contains("/tmp/autopilot-recover.mjs"));
        assert!(launcher.contains("autopilot recover [--list]"));
        assert!(!launcher.contains("autopilot note"));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_launcher_keeps_groups_when_recovery_is_unavailable() {
        let launcher = build_unix_launcher(Path::new("/tmp/autopilot-group.mjs"), None);

        assert!(launcher.contains("group)\n    shift\n    exec bun run"));
        assert!(!launcher.contains("recover)"));
        assert!(!launcher.contains("autopilot recover"));
        assert!(!launcher.contains("autopilot note"));
    }

    #[test]
    fn windows_launcher_routes_groups_without_notes() {
        let launcher = build_windows_launcher(Path::new(r"C:\Autopilot\autopilot-group.mjs"));

        assert!(launcher.contains("if /I \"%~1\"==\"group\" goto group"));
        assert!(launcher.contains("bun run \"C:\\Autopilot\\autopilot-group.mjs\" !ARGS!"));
        assert!(launcher.contains("autopilot group [--worktree ^<path^>] set ^<name^>"));
        assert!(!launcher.contains("autopilot note"));
    }

    #[test]
    fn windows_path_matching_ignores_case_and_spacing() {
        assert!(path_contains_entry(
            r"C:\Users\me\.local\bin; C:\Windows\System32",
            r"c:\users\me\.LOCAL\BIN"
        ));
    }

    #[test]
    fn removes_only_launchers_owned_by_the_legacy_note_cli() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let legacy_launcher = temp_dir.path().join("autopilot");
        let unrelated_launcher = temp_dir.path().join("other-autopilot");
        let note_script = temp_dir.path().join("autopilot-note.mjs");
        #[cfg(not(target_os = "windows"))]
        let legacy_contents = build_legacy_unix_launcher(&note_script);
        #[cfg(target_os = "windows")]
        let legacy_contents = build_legacy_windows_launcher(&note_script, false);
        fs::write(&legacy_launcher, legacy_contents).expect("legacy launcher");
        fs::write(
            &unrelated_launcher,
            format!("wrapper for {}", note_script.display()),
        )
        .expect("unrelated launcher");

        remove_legacy_launcher(&legacy_launcher, &note_script).expect("legacy cleanup");
        remove_legacy_launcher(&unrelated_launcher, &note_script).expect("unrelated cleanup");

        assert!(!legacy_launcher.exists());
        assert!(unrelated_launcher.exists());
    }

    #[test]
    fn recognizes_both_exact_windows_legacy_launchers() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let note_script = temp_dir.path().join("autopilot-note.mjs");

        for original in [true, false] {
            let contents = build_legacy_windows_launcher(&note_script, original);
            assert!(is_legacy_windows_launcher(
                contents.as_bytes(),
                &note_script
            ));
        }
        assert!(!is_legacy_windows_launcher(
            format!("wrapper for {}", note_script.display()).as_bytes(),
            &note_script,
        ));
    }

    #[test]
    fn removes_obsolete_note_script_when_present() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let note_script = temp_dir.path().join("autopilot-note.mjs");
        fs::write(&note_script, "legacy").expect("note script");

        remove_file_if_present(&note_script).expect("note script cleanup");
        remove_file_if_present(&note_script).expect("missing note script cleanup");

        assert!(!note_script.exists());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn removes_only_the_exact_autopilot_path_block() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let profile_path = temp_dir.path().join(".profile");
        let path_block = unix_path_block(Path::new("/tmp/autopilot-bin"));
        fs::write(
            &profile_path,
            format!("export BEFORE=1\n{path_block}export AFTER=1\n"),
        )
        .expect("profile");

        remove_block_if_present(&profile_path, &path_block).expect("path cleanup");

        assert_eq!(
            fs::read_to_string(profile_path).expect("profile contents"),
            "export BEFORE=1\nexport AFTER=1\n"
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn append_block_if_missing_creates_a_missing_profile_file() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let profile_path = temp_dir.path().join(".profile");

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
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn append_block_if_missing_returns_read_errors_instead_of_clobbering() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let error = append_block_if_missing(
            temp_dir.path(),
            "\n# AUTOPILOT PATH\nexport PATH=\"/tmp/bin:$PATH\"\n",
        )
        .expect_err("directory reads should fail");

        assert_eq!(error.kind(), ErrorKind::IsADirectory);
    }
}
