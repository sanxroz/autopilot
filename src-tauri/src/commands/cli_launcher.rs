use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use tauri::{AppHandle, Manager};

const LAUNCHER_DIR_NAME: &str = ".local/bin";
const PATH_BLOCK_MARKER: &str = "# AUTOPILOT PATH";

const LAUNCHER_NAME: &str = "autopilot";
const RECOVER_SCRIPT_NAME: &str = "autopilot-recover.mjs";

pub fn install_cli_launcher(app: &AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let home_dir = dirs::home_dir().ok_or_else(|| "home directory unavailable".to_string())?;
        let launcher_dir = home_dir.join(LAUNCHER_DIR_NAME);
        let app_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?;
        let cli_dir = app_data_dir.join("cli");
        let recover_script_path = cli_dir.join(RECOVER_SCRIPT_NAME);
        let launcher_path = launcher_dir.join(LAUNCHER_NAME);

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

        Ok(())
    }
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
    use std::path::Path;
    #[cfg(not(target_os = "windows"))]
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(not(target_os = "windows"))]
    use super::{append_block_if_missing, build_unix_launcher};

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

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_launcher_routes_recovery() {
        let launcher = build_unix_launcher(Path::new("/tmp/autopilot-recover.mjs"));

        assert!(launcher.contains("recover)\n    shift\n    exec bun run"));
        assert!(launcher.contains("/tmp/autopilot-recover.mjs"));
        assert!(launcher.contains("autopilot recover [--list]"));
        assert!(!launcher.contains("autopilot note"));
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
