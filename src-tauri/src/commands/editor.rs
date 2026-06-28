use super::cli_tools::find_cli_tool;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use parking_lot::Mutex;

static INSTALLED_IDE_CACHE: OnceLock<Mutex<Option<Vec<InstalledIde>>>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledIde {
    pub id: String,
    pub name: String,
    pub app_path: Option<String>,
    pub cli_path: Option<String>,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct IdeCandidate {
    id: &'static str,
    name: &'static str,
    app_names: &'static [&'static str],
    cli_names: &'static [&'static str],
}

const IDE_CANDIDATES: &[IdeCandidate] = &[
    IdeCandidate {
        id: "cursor",
        name: "Cursor",
        app_names: &["Cursor.app"],
        cli_names: &["cursor"],
    },
    IdeCandidate {
        id: "vscode",
        name: "Visual Studio Code",
        app_names: &["Visual Studio Code.app"],
        cli_names: &["code"],
    },
    IdeCandidate {
        id: "vscode-insiders",
        name: "Visual Studio Code Insiders",
        app_names: &["Visual Studio Code - Insiders.app"],
        cli_names: &["code-insiders"],
    },
    IdeCandidate {
        id: "vscodium",
        name: "VSCodium",
        app_names: &["VSCodium.app"],
        cli_names: &["codium"],
    },
    IdeCandidate {
        id: "zed",
        name: "Zed",
        app_names: &["Zed.app"],
        cli_names: &["zed"],
    },
    IdeCandidate {
        id: "sublime-text",
        name: "Sublime Text",
        app_names: &["Sublime Text.app"],
        cli_names: &["subl"],
    },
    IdeCandidate {
        id: "webstorm",
        name: "WebStorm",
        app_names: &["WebStorm.app"],
        cli_names: &["webstorm"],
    },
    IdeCandidate {
        id: "intellij-idea",
        name: "IntelliJ IDEA",
        app_names: &["IntelliJ IDEA.app", "IntelliJ IDEA CE.app"],
        cli_names: &["idea", "idea-ce"],
    },
    IdeCandidate {
        id: "pycharm",
        name: "PyCharm",
        app_names: &["PyCharm.app", "PyCharm CE.app"],
        cli_names: &["pycharm"],
    },
    IdeCandidate {
        id: "goland",
        name: "GoLand",
        app_names: &["GoLand.app"],
        cli_names: &["goland"],
    },
    IdeCandidate {
        id: "clion",
        name: "CLion",
        app_names: &["CLion.app"],
        cli_names: &["clion"],
    },
    IdeCandidate {
        id: "android-studio",
        name: "Android Studio",
        app_names: &["Android Studio.app"],
        cli_names: &["studio"],
    },
    IdeCandidate {
        id: "xcode",
        name: "Xcode",
        app_names: &["Xcode.app"],
        cli_names: &["xed"],
    },
    IdeCandidate {
        id: "warp",
        name: "Warp",
        app_names: &["Warp.app"],
        cli_names: &["warp"],
    },
    IdeCandidate {
        id: "ghostty",
        name: "Ghostty",
        app_names: &["Ghostty.app"],
        cli_names: &["ghostty"],
    },
    IdeCandidate {
        id: "iterm",
        name: "iTerm",
        app_names: &["iTerm.app"],
        cli_names: &[],
    },
    IdeCandidate {
        id: "terminal",
        name: "Terminal",
        app_names: &["Terminal.app"],
        cli_names: &[],
    },
    IdeCandidate {
        id: "wezterm",
        name: "WezTerm",
        app_names: &["WezTerm.app"],
        cli_names: &["wezterm"],
    },
    IdeCandidate {
        id: "alacritty",
        name: "Alacritty",
        app_names: &["Alacritty.app"],
        cli_names: &["alacritty"],
    },
    IdeCandidate {
        id: "kitty",
        name: "kitty",
        app_names: &["kitty.app"],
        cli_names: &["kitty"],
    },
];

#[cfg(target_os = "macos")]
fn discover_app_path(candidate: IdeCandidate) -> Option<String> {
    candidate
        .app_names
        .iter()
        .find_map(|app_name| find_macos_application(app_name))
}

#[cfg(not(target_os = "macos"))]
fn discover_app_path(_candidate: IdeCandidate) -> Option<String> {
    None
}

fn discover_cli_path(candidate: IdeCandidate) -> Option<String> {
    candidate
        .cli_names
        .iter()
        .find_map(|cli_name| find_cli_tool(cli_name).ok())
}

fn collect_installed_ides() -> Vec<InstalledIde> {
    let mut cache = INSTALLED_IDE_CACHE.get_or_init(|| Mutex::new(None)).lock();
    if let Some(cached) = cache.as_ref() {
        return cached.clone();
    }

    let discovered = IDE_CANDIDATES
        .iter()
        .filter_map(|candidate| {
            let app_path = discover_app_path(*candidate);
            let cli_path = discover_cli_path(*candidate);

            if app_path.is_none() && cli_path.is_none() {
                return None;
            }

            Some(InstalledIde {
                id: candidate.id.to_string(),
                name: candidate.name.to_string(),
                icon_path: app_path
                    .as_deref()
                    .and_then(|path| generate_app_icon(path, candidate.id)),
                app_path,
                cli_path,
            })
        })
        .collect::<Vec<_>>();
    *cache = Some(discovered.clone());
    discovered
}

#[cfg(target_os = "macos")]
fn find_macos_application(app_name: &str) -> Option<String> {
    find_macos_application_with_spotlight(app_name)
        .or_else(|| find_macos_application_in_standard_directories(app_name))
}

#[cfg(target_os = "macos")]
fn find_macos_application_with_spotlight(app_name: &str) -> Option<String> {
    let output = Command::new("mdfind")
        .arg(format!("kMDItemFSName == '{}'c", app_name))
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let mut matches = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.ends_with(".app"))
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    matches.sort_by_key(|path| application_priority(path));
    matches
        .into_iter()
        .find(|path| is_macos_application_bundle(Path::new(path)))
}

#[cfg(target_os = "macos")]
fn find_macos_application_in_standard_directories(app_name: &str) -> Option<String> {
    let search_directories = macos_application_search_directories();
    find_macos_application_in_directories(app_name, &search_directories)
}

#[cfg(target_os = "macos")]
fn find_macos_application_in_directories(
    app_name: &str,
    directories: &[PathBuf],
) -> Option<String> {
    let mut matches = directories
        .iter()
        .flat_map(|directory| find_macos_application_in_directory(directory, app_name, 3))
        .collect::<Vec<_>>();

    matches.sort_by_key(|path| application_priority(path));
    matches.dedup();
    matches.into_iter().next()
}

#[cfg(target_os = "macos")]
fn find_macos_application_in_directory(
    directory: &Path,
    app_name: &str,
    remaining_depth: u8,
) -> Vec<String> {
    if remaining_depth == 0 || !directory.is_dir() {
        return Vec::new();
    }

    std::fs::read_dir(directory)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .flat_map(|entry| {
            let path = entry.path();
            if path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
            {
                let matches_name = path
                    .file_name()
                    .and_then(|file_name| file_name.to_str())
                    .is_some_and(|file_name| file_name.eq_ignore_ascii_case(app_name));

                if matches_name && is_macos_application_bundle(&path) {
                    return vec![path.to_string_lossy().to_string()];
                }

                return Vec::new();
            }

            find_macos_application_in_directory(&path, app_name, remaining_depth - 1)
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn macos_application_search_directories() -> Vec<PathBuf> {
    let mut directories = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Setapp"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
        PathBuf::from("/System/Library/CoreServices"),
    ];

    if let Some(home_dir) = std::env::var_os("HOME") {
        directories.push(PathBuf::from(home_dir).join("Applications"));
    }

    directories
}

#[cfg(target_os = "macos")]
fn is_macos_application_bundle(path: &Path) -> bool {
    path.is_dir() && path.join("Contents/Info.plist").exists()
}

#[cfg(target_os = "macos")]
fn application_priority(path: &str) -> u8 {
    if path.starts_with("/Applications/") {
        return 0;
    }

    if let Some(home_dir) = std::env::var_os("HOME") {
        let home_applications = PathBuf::from(home_dir).join("Applications");
        if Path::new(path).starts_with(&home_applications) {
            return 1;
        }
    }

    2
}

#[cfg(target_os = "macos")]
fn generate_app_icon(app_path: &str, app_id: &str) -> Option<String> {
    let cache_directory = std::env::temp_dir()
        .join("autopilot-open-with-icons")
        .join(app_id);
    std::fs::create_dir_all(&cache_directory).ok()?;

    if let Some(existing_icon) = find_generated_icon(&cache_directory) {
        return Some(existing_icon);
    }

    let source_icon = resolve_app_icon_source(Path::new(app_path))?;
    let output_path = cache_directory.join("icon.png");

    let status = Command::new("sips")
        .args(["-s", "format", "png"])
        .arg(source_icon)
        .arg("--out")
        .arg(&output_path)
        .status()
        .ok()?;

    if !status.success() {
        return None;
    }

    Some(output_path.to_string_lossy().to_string())
}

#[cfg(not(target_os = "macos"))]
fn generate_app_icon(_app_path: &str, _app_id: &str) -> Option<String> {
    None
}

fn find_generated_icon(directory: &Path) -> Option<String> {
    let mut png_files = std::fs::read_dir(directory)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "png"))
        .collect::<Vec<_>>();

    png_files.sort();
    png_files
        .first()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(target_os = "macos")]
fn resolve_app_icon_source(app_path: &Path) -> Option<PathBuf> {
    let info_plist_path = app_path.join("Contents/Info.plist");
    let resources_directory = app_path.join("Contents/Resources");

    let icon_name = Command::new("defaults")
        .arg("read")
        .arg(&info_plist_path)
        .arg("CFBundleIconFile")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());

    if let Some(icon_name) = icon_name {
        let direct_match = resources_directory.join(&icon_name);
        if direct_match.exists() {
            return Some(direct_match);
        }

        let icns_match = resources_directory.join(format!("{}.icns", icon_name));
        if icns_match.exists() {
            return Some(icns_match);
        }

        let png_match = resources_directory.join(format!("{}.png", icon_name));
        if png_match.exists() {
            return Some(png_match);
        }
    }

    std::fs::read_dir(&resources_directory)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension == "icns" || extension == "png")
        })
}

fn open_with_app(app_path: &str, worktree_path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-a")
            .arg(app_path)
            .arg(worktree_path)
            .status()
            .map_err(|error| format!("Failed to open {}: {}", app_path, error))?;

        if status.success() {
            return Ok(());
        }

        Err(format!(
            "Opening {} exited with status {}",
            app_path, status
        ))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_path;
        let _ = worktree_path;
        Err("Opening applications by app bundle is only implemented on macOS".to_string())
    }
}

fn open_with_cli(cli_path: &str, worktree_path: &Path) -> Result<(), String> {
    let mut child = Command::new(cli_path)
        .arg(worktree_path)
        .spawn()
        .map_err(|error| format!("Failed to launch {}: {}", cli_path, error))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn resolve_worktree_path(worktree_path: &str) -> Result<PathBuf, String> {
    let resolved_worktree_path = PathBuf::from(worktree_path);
    if !resolved_worktree_path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    if !resolved_worktree_path.is_dir() {
        return Err(format!(
            "Worktree path is not a directory: {}",
            worktree_path
        ));
    }

    Ok(resolved_worktree_path)
}

#[tauri::command]
pub fn list_installed_ide_apps() -> Vec<InstalledIde> {
    collect_installed_ides()
}

#[tauri::command]
pub fn open_worktree_in_ide(worktree_path: String, ide_id: String) -> Result<(), String> {
    let resolved_worktree_path = resolve_worktree_path(&worktree_path)?;

    let installed_ide = collect_installed_ides()
        .into_iter()
        .find(|ide| ide.id == ide_id)
        .ok_or_else(|| format!("Editor is not available: {}", ide_id))?;

    if let Some(app_path) = installed_ide.app_path.as_deref() {
        match open_with_app(app_path, &resolved_worktree_path) {
            Ok(()) => return Ok(()),
            Err(app_error) => {
                if let Some(cli_path) = installed_ide.cli_path.as_deref() {
                    return open_with_cli(cli_path, &resolved_worktree_path)
                        .map_err(|cli_error| format!("{app_error}; {cli_error}"));
                }

                return Err(app_error);
            }
        }
    }

    if let Some(cli_path) = installed_ide.cli_path.as_deref() {
        return open_with_cli(cli_path, &resolved_worktree_path);
    }

    Err(format!(
        "No launch strategy is available for {}",
        installed_ide.name
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::LazyLock;

    static TEST_MUTEX: LazyLock<parking_lot::Mutex<()>> =
        LazyLock::new(|| parking_lot::Mutex::new(()));

    fn cache_for_tests() -> &'static parking_lot::Mutex<Option<Vec<InstalledIde>>> {
        INSTALLED_IDE_CACHE.get_or_init(|| parking_lot::Mutex::new(None))
    }

    fn with_test_ide(ide: InstalledIde) {
        *cache_for_tests().lock() = Some(vec![ide]);
    }

    fn reset_test_cache() {
        *cache_for_tests().lock() = None;
    }

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "autopilot-editor-test-{}-{}",
            std::process::id(),
            name
        ))
    }

    #[test]
    fn open_worktree_in_ide_rejects_non_directory_paths() {
        let _guard = TEST_MUTEX.lock();
        let file_path = temp_path("file");
        fs::write(&file_path, b"not a directory").expect("create temp file");
        with_test_ide(InstalledIde {
            id: "test-cli".to_string(),
            name: "Test CLI".to_string(),
            app_path: None,
            cli_path: Some("/usr/bin/true".to_string()),
            icon_path: None,
        });

        let result =
            open_worktree_in_ide(file_path.to_string_lossy().into_owned(), "test-cli".into());

        reset_test_cache();
        fs::remove_file(&file_path).expect("remove temp file");
        assert_eq!(
            result,
            Err(format!(
                "Worktree path is not a directory: {}",
                file_path.display()
            ))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn open_worktree_in_ide_preserves_app_launch_error_without_cli_fallback() {
        let _guard = TEST_MUTEX.lock();
        let directory_path = temp_path("directory");
        fs::create_dir_all(&directory_path).expect("create temp directory");
        with_test_ide(InstalledIde {
            id: "missing-app".to_string(),
            name: "Missing App".to_string(),
            app_path: Some("/Applications/DefinitelyMissing.app".to_string()),
            cli_path: None,
            icon_path: None,
        });

        let result = open_worktree_in_ide(
            directory_path.to_string_lossy().into_owned(),
            "missing-app".into(),
        );

        reset_test_cache();
        fs::remove_dir_all(&directory_path).expect("remove temp directory");
        assert!(
            matches!(result, Err(message) if message.contains("Opening /Applications/DefinitelyMissing.app exited with status"))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn find_macos_application_falls_back_to_directory_scan_when_spotlight_misses() {
        let _guard = TEST_MUTEX.lock();
        let root_directory = temp_path("app-scan");
        let nested_directory = root_directory.join("Applications").join("Utilities");
        let app_directory = nested_directory.join("Warp.app").join("Contents");
        fs::create_dir_all(&app_directory).expect("create mock app bundle");
        fs::write(
            app_directory.join("Info.plist"),
            b"<?xml version=\"1.0\"?><plist version=\"1.0\"></plist>",
        )
        .expect("write plist");

        let result = find_macos_application_in_directories(
            "Warp.app",
            &[root_directory.join("Applications")],
        );

        fs::remove_dir_all(&root_directory).expect("remove mock app bundle");
        assert_eq!(
            result,
            Some(
                root_directory
                    .join("Applications")
                    .join("Utilities")
                    .join("Warp.app")
                    .to_string_lossy()
                    .into_owned()
            )
        );
    }
}
