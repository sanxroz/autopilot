use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::AppState;

pub struct TerminalSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalOutput {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalSpawnResult {
    pub terminal_id: String,
}

fn get_shell() -> String {
    if cfg!(target_os = "windows") {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn should_wrap_shell(shell: &str) -> bool {
    let s = shell.to_ascii_lowercase();
    s.ends_with("/zsh") || s.ends_with("/bash")
}

#[tauri::command]
pub fn spawn_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalSpawnResult, String> {
    let terminal_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = get_shell();
    let mut cmd = if !cfg!(target_os = "windows") && should_wrap_shell(&shell) {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-li");
        c
    } else {
        CommandBuilder::new(&shell)
    };
    cmd.cwd(&cwd);

    if !cfg!(target_os = "windows") {
        cmd.env("TERM", "xterm-256color");
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session = TerminalSession {
        writer: Arc::new(Mutex::new(writer)),
        child,
        master: Arc::new(Mutex::new(pair.master)),
    };

    state.terminals.lock().insert(terminal_id.clone(), session);

    let tid = terminal_id.clone();
    let app_clone = app.clone();
    let state_terminals = state.terminals.clone();

    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];

        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let output = TerminalOutput {
                        terminal_id: tid.clone(),
                        data,
                    };
                    let _ = app_clone.emit("terminal-output", output);
                }
                Err(_) => break,
            }
        }

        state_terminals.lock().remove(&tid);
        let _ = app_clone.emit("terminal-closed", tid);
    });

    Ok(TerminalSpawnResult { terminal_id })
}

#[tauri::command]
pub fn write_to_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let terminals = state.terminals.lock();
    let session = terminals
        .get(&terminal_id)
        .ok_or("Terminal not found")?;

    let mut writer = session.writer.lock();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terminals = state.terminals.lock();
    let session = terminals
        .get(&terminal_id)
        .ok_or("Terminal not found")?;

    let master = session.master.lock();
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn close_terminal(state: State<'_, AppState>, terminal_id: String) -> Result<(), String> {
    let mut terminals = state.terminals.lock();
    if let Some(session) = terminals.remove(&terminal_id) {
        if let Some(pid) = session.child.process_id() {
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }
            #[cfg(windows)]
            {
                let _ = session.child.kill();
            }
        }
    }
    Ok(())
}
