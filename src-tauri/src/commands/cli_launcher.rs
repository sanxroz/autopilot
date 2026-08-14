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
    let launcher_path = launcher_dir.join(LAUNCHER_NAME);

    #[cfg(not(target_os = "macos"))]
    {
        remove_legacy_launcher(&launcher_path).map_err(|error| error.to_string())?;
        remove_file_if_present(&note_script_path).map_err(|error| error.to_string())?;
        #[cfg(not(target_os = "windows"))]
        remove_unix_path_blocks(&home_dir, &launcher_dir).map_err(|error| error.to_string())?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let recover_script_path = cli_dir.join(RECOVER_SCRIPT_NAME);

        fs::create_dir_all(&cli_dir).map_err(|error| error.to_string())?;
        fs::create_dir_all(&launcher_dir).map_err(|error| error.to_string())?;

        write_file_if_changed(
            &recover_script_path,
            include_str!("../../../scripts/autopilot-recover.mjs"),
        )
        .map_err(|error| error.to_string())?;
        write_file_if_changed(&launcher_path, &build_unix_launcher(&recover_script_path))
            .map_err(|error| error.to_string())?;
        set_executable(&launcher_path).map_err(|error| error.to_string())?;
        ensure_unix_path_contains(&launcher_dir)?;
        remove_file_if_present(&note_script_path).map_err(|error| error.to_string())?;

        Ok(())
    }
}

fn remove_file_if_present(path: &Path) -> Result<(), std::io::Error> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn remove_legacy_launcher(path: &Path) -> Result<(), std::io::Error> {
    let contents = match fs::read(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if contents
        .windows(NOTE_SCRIPT_NAME.len())
        .any(|window| window == NOTE_SCRIPT_NAME.as_bytes())
    {
        remove_file_if_present(path)?;
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

fn build_unix_launcher(recover_script_path: &Path) -> String {
    format!(
        r#"#!/bin/sh
set -eu

case "${{1:-}}" in
  recover)
    shift
    exec bun run "{}" "$@"
    ;;
  --help|-h|help|"")
    cat <<'EOF'
Usage:
  autopilot recover [--list]
EOF
    ;;
  *)
    printf 'Unknown autopilot command: %s\n' "$1" >&2
    exit 1
    ;;
esac
"#,
        recover_script_path.display(),
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
fn remove_unix_path_blocks(home_dir: &Path, launcher_dir: &Path) -> Result<(), std::io::Error> {
    let path_block = unix_path_block(launcher_dir);
    for path in [".profile", ".bashrc", ".zprofile", ".zshrc"] {
        remove_block_if_present(&home_dir.join(path), &path_block)?;
    }
    Ok(())
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
        append_block_if_missing, build_unix_launcher, remove_block_if_present, unix_path_block,
    };
    use super::{remove_file_if_present, remove_legacy_launcher};

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_launcher_routes_recovery() {
        let launcher = build_unix_launcher(Path::new("/tmp/autopilot-recover.mjs"));

        assert!(launcher.contains("recover)\n    shift\n    exec bun run"));
        assert!(launcher.contains("/tmp/autopilot-recover.mjs"));
        assert!(launcher.contains("autopilot recover [--list]"));
        assert!(!launcher.contains("autopilot note"));
    }

    #[test]
    fn removes_only_launchers_owned_by_the_legacy_note_cli() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let legacy_launcher = temp_dir.path().join("autopilot");
        let unrelated_launcher = temp_dir.path().join("other-autopilot");
        fs::write(&legacy_launcher, "exec autopilot-note.mjs").expect("legacy launcher");
        fs::write(&unrelated_launcher, "exec another-tool").expect("unrelated launcher");

        remove_legacy_launcher(&legacy_launcher).expect("legacy cleanup");
        remove_legacy_launcher(&unrelated_launcher).expect("unrelated cleanup");

        assert!(!legacy_launcher.exists());
        assert!(unrelated_launcher.exists());
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
