use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

const SETTINGS_FILE_NAME: &str = "autopilot-settings.json";
const EMPTY_LOCK_STALE_AFTER: Duration = Duration::from_secs(5);
const LOCK_RETRY_DELAY: Duration = Duration::from_millis(50);

#[derive(Default)]
pub struct SettingsLockState(Mutex<Option<SettingsFileLock>>);

struct SettingsFileLock {
    file: Option<File>,
    path: Option<PathBuf>,
}

impl SettingsFileLock {
    fn acquire(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        loop {
            match Self::try_create(path) {
                Ok(lock) => return Ok(lock),
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                    validate_existing_lock(path)?;
                    std::thread::sleep(LOCK_RETRY_DELAY);
                }
                Err(error) => return Err(error.to_string()),
            }
        }
    }

    fn try_create(path: &Path) -> Result<Self, std::io::Error> {
        let candidate_path = path.with_extension(format!(
            "lock.{}.{}.tmp",
            std::process::id(),
            Uuid::new_v4()
        ));
        let mut candidate = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate_path)?;
        if let Err(error) = writeln!(candidate, "{}", std::process::id()) {
            let _ = fs::remove_file(candidate_path);
            return Err(error);
        }
        drop(candidate);
        if let Err(error) = fs::hard_link(&candidate_path, path) {
            let _ = fs::remove_file(candidate_path);
            return Err(error);
        }
        let file = File::open(path);
        let _ = fs::remove_file(candidate_path);
        match file {
            Ok(file) => Ok(Self {
                file: Some(file),
                path: Some(path.to_path_buf()),
            }),
            Err(error) => {
                let _ = fs::remove_file(path);
                Err(error)
            }
        }
    }

    fn release(mut self) -> Result<(), std::io::Error> {
        self.file.take();
        let path = self.path.take().expect("settings lock path");
        match remove_file_if_present(&path) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.path = Some(path);
                Err(error)
            }
        }
    }
}

impl Drop for SettingsFileLock {
    fn drop(&mut self) {
        self.file.take();
        if let Some(path) = self.path.take() {
            let _ = remove_file_if_present(&path);
        }
    }
}

fn validate_existing_lock(path: &Path) -> Result<(), String> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let trimmed = contents.trim();
    if trimmed.is_empty() {
        let age = fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .and_then(|modified| {
                SystemTime::now()
                    .duration_since(modified)
                    .map_err(std::io::Error::other)
            })
            .map_err(|error| error.to_string())?;
        if age >= EMPTY_LOCK_STALE_AFTER {
            return Err(format!(
                "Stale empty Autopilot settings lock at {}. Remove it after confirming no Autopilot CLI process is running.",
                path.display()
            ));
        }
        return Ok(());
    }

    let pid = trimmed.parse::<u32>().map_err(|_| {
        format!(
            "Invalid Autopilot settings lock at {}. Remove it after confirming no Autopilot CLI process is running.",
            path.display()
        )
    })?;
    if !process_exists(pid) {
        return Err(format!(
            "Stale Autopilot settings lock for PID {pid} at {}. Remove it after confirming that process is no longer running.",
            path.display()
        ));
    }
    Ok(())
}

fn process_exists(pid: u32) -> bool {
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    system.process(pid).is_some()
}

fn remove_file_if_present(path: &Path) -> Result<(), std::io::Error> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn acquire_settings_lock(
    app: AppHandle,
    state: State<'_, SettingsLockState>,
) -> Result<(), String> {
    let settings_path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join(SETTINGS_FILE_NAME);
    let mut lock_path = settings_path.into_os_string();
    lock_path.push(".lock");
    let lock_path = PathBuf::from(lock_path);
    loop {
        let mut active_lock = state.0.lock().await;
        if active_lock.is_some() {
            drop(active_lock);
            tokio::time::sleep(LOCK_RETRY_DELAY).await;
            continue;
        }
        let lock_path = lock_path.clone();
        let lock = tokio::task::spawn_blocking(move || SettingsFileLock::acquire(&lock_path))
            .await
            .map_err(|error| error.to_string())??;
        *active_lock = Some(lock);
        return Ok(());
    }
}

#[tauri::command]
pub async fn release_settings_lock(state: State<'_, SettingsLockState>) -> Result<(), String> {
    let lock = state
        .0
        .lock()
        .await
        .take()
        .ok_or_else(|| "Autopilot settings lock is not held by the app".to_string())?;
    tokio::task::spawn_blocking(move || lock.release())
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead as _, BufReader, Write as _};
    use std::process::{Command, Stdio};
    use std::sync::mpsc;

    use super::*;

    #[test]
    fn waits_for_an_existing_settings_lock() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let lock_path = temp_dir.path().join("autopilot-settings.json.lock");
        let first = SettingsFileLock::acquire(&lock_path).expect("first lock");
        let second_path = lock_path.clone();
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            sender
                .send(SettingsFileLock::acquire(&second_path))
                .expect("send second lock");
        });

        assert!(receiver.recv_timeout(Duration::from_millis(100)).is_err());
        first.release().expect("release first lock");
        let second = receiver
            .recv_timeout(Duration::from_secs(2))
            .expect("second lock result")
            .expect("second lock");
        assert!(lock_path.exists());
        second.release().expect("release second lock");
    }

    #[test]
    fn interoperates_with_the_bun_cli_lock() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let lock_path = temp_dir.path().join("autopilot-settings.json.lock");
        let settings_module = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../scripts/autopilot-settings.mjs")
            .canonicalize()
            .expect("settings module");
        let script = r#"
import { pathToFileURL } from "node:url";
const { acquireLock, releaseLock } = await import(pathToFileURL(process.env.AUTOPILOT_SETTINGS_MODULE).href);
const lockPath = process.env.AUTOPILOT_TEST_LOCK_PATH;
const lock = await acquireLock(lockPath);
console.log("ready");
await new Promise((resolve) => process.stdin.once("data", resolve));
await releaseLock(lock, lockPath);
"#;
        let mut child = Command::new("bun")
            .args(["--eval", script])
            .env("AUTOPILOT_SETTINGS_MODULE", settings_module)
            .env("AUTOPILOT_TEST_LOCK_PATH", &lock_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("start Bun lock holder");
        let mut ready = String::new();
        BufReader::new(child.stdout.take().expect("Bun stdout"))
            .read_line(&mut ready)
            .expect("Bun ready line");
        assert_eq!(ready.trim(), "ready");

        let second_path = lock_path.clone();
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            sender
                .send(SettingsFileLock::acquire(&second_path))
                .expect("send Rust lock");
        });
        let remained_blocked = receiver.recv_timeout(Duration::from_millis(100)).is_err();
        let mut stdin = child.stdin.take().expect("Bun stdin");
        stdin.write_all(b"release\n").expect("release Bun lock");
        drop(stdin);
        let status = child.wait().expect("Bun lock holder status");
        let rust_lock = receiver
            .recv_timeout(Duration::from_secs(2))
            .expect("Rust lock result")
            .expect("Rust lock");
        rust_lock.release().expect("release Rust lock");

        assert!(remained_blocked);
        assert!(status.success());
    }
}
