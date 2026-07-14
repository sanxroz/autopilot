use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Response, Server, StatusCode};
use uuid::Uuid;

use crate::AppState;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

pub struct TerminalSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    replay: Arc<Mutex<TerminalReplayBuffer>>,
}

/// Shared state for an agent-backed terminal, readable from any thread.
pub struct AgentTerminalInfo {
    pub worktree_path: String,
    pub session_id: String,
    pub agent: String,
    /// Epoch-millis of the most recent PTY output chunk.
    pub last_output_ms: AtomicI64,
    /// Whether the watchdog currently considers this terminal idle (waiting).
    pub is_waiting: AtomicBool,
    /// Set to `false` when the reader thread exits so the watchdog stops.
    pub is_alive: AtomicBool,
    /// When `true`, lifecycle hooks (Start/Stop) are injected.
    /// Raw PTY output should NOT override the hook-determined state.
    pub hook_enabled: AtomicBool,
}

#[derive(Clone)]
pub struct AgentHookRuntime {
    pub port: u16,
    pub notify_script_path: Option<String>,
    pub claude_settings_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalSpawnResult {
    pub terminal_id: String,
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentStatusEvent {
    worktree_path: String,
    session_id: String,
    terminal_id: String,
    status: String,
    timestamp: i64,
    agent: Option<String>,
    message: Option<String>,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// How long output must be silent before we consider the agent idle.
const INACTIVITY_TIMEOUT_MS: i64 = 2000;

/// How often the watchdog thread checks for inactivity.
const WATCHDOG_POLL_MS: u64 = 500;

const TERMINAL_REPLAY_MAX_BYTES: usize = 256 * 1024;
const TERMINAL_REPLAY_CHUNK_MAX_BYTES: usize = 4096;
const COMPLETED_TERMINAL_OUTPUT_MAX_BYTES: usize = 4 * 1024 * 1024;
const COMPLETED_TERMINAL_OUTPUT_MAX_ENTRIES: usize = 64;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    data: String,
    sequence: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputSnapshot {
    data: String,
    sequence: u64,
}

impl TerminalOutputSnapshot {
    fn new(data: impl Into<String>, sequence: u64) -> Self {
        Self {
            data: data.into(),
            sequence,
        }
    }
}

struct TerminalReplayBuffer {
    chunks: VecDeque<String>,
    bytes: usize,
    max_bytes: usize,
    chunk_max_bytes: usize,
    sequence: u64,
}

impl TerminalReplayBuffer {
    fn new(max_bytes: usize) -> Self {
        Self {
            chunks: VecDeque::new(),
            bytes: 0,
            max_bytes,
            chunk_max_bytes: max_bytes.min(TERMINAL_REPLAY_CHUNK_MAX_BYTES),
            sequence: 0,
        }
    }

    fn push(&mut self, data: String) -> TerminalOutput {
        self.bytes += data.len();
        let append_to_last_chunk = self
            .chunks
            .back()
            .is_some_and(|chunk| chunk.len() + data.len() <= self.chunk_max_bytes);
        if append_to_last_chunk {
            if let Some(chunk) = self.chunks.back_mut() {
                chunk.push_str(&data);
            }
        } else {
            self.chunks.push_back(data.clone());
        }

        while self.bytes > self.max_bytes {
            let Some(removed) = self.chunks.pop_front() else {
                break;
            };
            self.bytes -= removed.len();
        }

        self.sequence += 1;
        TerminalOutput {
            data,
            sequence: self.sequence,
        }
    }

    fn snapshot(&self) -> TerminalOutputSnapshot {
        TerminalOutputSnapshot::new(
            self.chunks.iter().map(String::as_str).collect::<String>(),
            self.sequence,
        )
    }
}

pub struct CompletedTerminalOutputCache {
    entries: VecDeque<(String, TerminalOutputSnapshot)>,
    bytes: usize,
    max_bytes: usize,
    max_entries: usize,
}

impl Default for CompletedTerminalOutputCache {
    fn default() -> Self {
        Self::new(COMPLETED_TERMINAL_OUTPUT_MAX_BYTES)
    }
}

impl CompletedTerminalOutputCache {
    fn new(max_bytes: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            bytes: 0,
            max_bytes,
            max_entries: COMPLETED_TERMINAL_OUTPUT_MAX_ENTRIES,
        }
    }

    fn get(&self, terminal_id: &str) -> Option<TerminalOutputSnapshot> {
        self.entries
            .iter()
            .find(|(id, _)| id == terminal_id)
            .map(|(_, snapshot)| snapshot.clone())
    }

    fn insert(&mut self, terminal_id: String, snapshot: TerminalOutputSnapshot) {
        if let Some(index) = self.entries.iter().position(|(id, _)| id == &terminal_id) {
            if let Some((_, removed)) = self.entries.remove(index) {
                self.bytes -= removed.data.len();
            }
        }

        self.bytes += snapshot.data.len();
        self.entries.push_back((terminal_id, snapshot));

        while self.bytes > self.max_bytes || self.entries.len() > self.max_entries {
            let Some((_, removed)) = self.entries.pop_front() else {
                break;
            };
            self.bytes -= removed.data.len();
        }
    }

    fn remove(&mut self, terminal_id: &str) {
        if let Some(index) = self.entries.iter().position(|(id, _)| id == terminal_id) {
            if let Some((_, removed)) = self.entries.remove(index) {
                self.bytes -= removed.data.len();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_terminal_output(
    app: &AppHandle,
    event_name: &str,
    replay: &Arc<Mutex<TerminalReplayBuffer>>,
    data: String,
) {
    if data.is_empty() {
        return;
    }
    let output = replay.lock().push(data);
    let _ = app.emit(event_name, output);
}

struct Utf8StreamDecoder {
    pending: Vec<u8>,
}

impl Utf8StreamDecoder {
    fn new() -> Self {
        Self {
            pending: Vec::new(),
        }
    }

    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();

        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(valid) => {
                    out.push_str(valid);
                    self.pending.clear();
                    break;
                }
                Err(err) => {
                    let valid_up_to = err.valid_up_to();
                    if valid_up_to > 0 {
                        if let Ok(valid) = std::str::from_utf8(&self.pending[..valid_up_to]) {
                            out.push_str(valid);
                        }
                        self.pending.drain(..valid_up_to);
                        continue;
                    }

                    match err.error_len() {
                        None => break,
                        Some(invalid_len) => {
                            let replacement = String::from_utf8_lossy(&self.pending[..invalid_len]);
                            out.push_str(&replacement);
                            self.pending.drain(..invalid_len);
                        }
                    }
                }
            }
        }

        out
    }

    fn flush(&mut self) -> String {
        if self.pending.is_empty() {
            return String::new();
        }

        let out = String::from_utf8_lossy(&self.pending).to_string();
        self.pending.clear();
        out
    }
}

fn detect_agent_from_command(command: &str) -> Option<&'static str> {
    let lower = command.trim().to_lowercase();
    if lower.is_empty() {
        return None;
    }

    let first_token = lower
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .trim_matches(|c: char| c == '\'' || c == '"');

    if first_token.ends_with("/opencode") || first_token == "opencode" {
        return Some("opencode");
    }
    if first_token.ends_with("/claude") || first_token == "claude" {
        return Some("claude");
    }
    if first_token.ends_with("/droid") || first_token == "droid" {
        return Some("droid");
    }
    if first_token.ends_with("/amp") || first_token == "amp" {
        return Some("amp");
    }
    if first_token.ends_with("/codex") || first_token == "codex" {
        return Some("codex");
    }

    None
}

/// Detect OSC 133/633 "command start" (= shell/agent ready for user input).
fn contains_osc_prompt_ready(data: &str) -> bool {
    data.contains("\x1b]133;B\x07")
        || data.contains("\x1b]633;B\x07")
        || data.contains("\x1b]133;B\x1b\\")
        || data.contains("\x1b]633;B\x1b\\")
}

/// Detect OSC 133/633 "command executed" (= user pressed Enter, running).
fn contains_osc_command_executed(data: &str) -> bool {
    data.contains("\x1b]133;C\x07")
        || data.contains("\x1b]633;C\x07")
        || data.contains("\x1b]133;C\x1b\\")
        || data.contains("\x1b]633;C\x1b\\")
}

fn emit_agent_status(
    app: &AppHandle,
    worktree_path: &str,
    session_id: &str,
    terminal_id: &str,
    status: &str,
    agent: Option<&str>,
    message: Option<String>,
) {
    let event = AgentStatusEvent {
        worktree_path: worktree_path.to_string(),
        session_id: session_id.to_string(),
        terminal_id: terminal_id.to_string(),
        status: status.to_string(),
        timestamp: now_ms(),
        agent: agent.map(|v| v.to_string()),
        message,
    };
    let _ = app.emit("agent-status-changed", event);
}

fn get_shell() -> String {
    if cfg!(target_os = "windows") {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn shell_quote_single(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn percent_decode(input: &str) -> String {
    let mut out = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn parse_query_param(url: &str, key: &str) -> Option<String> {
    let (_, query) = url.split_once('?')?;
    for part in query.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn write_hook_file(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| format!("{}: {e}", path.display()))
}

fn setup_hook_files(hooks_dir: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let notify_path = hooks_dir.join("notify.sh");
    let claude_settings_path = hooks_dir.join("claude-settings.json");
    let amp_delegate_path = hooks_dir.join("amp-delegate.sh");

    let notify_script = r#"#!/bin/bash
# Autopilot agent notification hook
trap 'printf "{\"suppressOutput\":true}"' EXIT
[ -z "$AUTOPILOT_TERMINAL_ID" ] && exit 0

# Get JSON input
if [ -n "$1" ]; then INPUT="$1"; else INPUT=$(cat); fi

# Extract event type
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$EVENT_TYPE" ]; then
  CODEX_TYPE=$(echo "$INPUT" | grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
  [ "$CODEX_TYPE" = "agent-turn-complete" ] && EVENT_TYPE="Stop"
fi

[ "$EVENT_TYPE" = "UserPromptSubmit" ] && EVENT_TYPE="Start"
[ -z "$EVENT_TYPE" ] && exit 0

curl -sG "http://127.0.0.1:${AUTOPILOT_HOOK_PORT}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "terminalId=$AUTOPILOT_TERMINAL_ID" \
  --data-urlencode "eventType=$EVENT_TYPE" \
  > /dev/null 2>&1 &
exit 0
"#;

    // AMP permission delegate: always allows (exit 0), notifies lifecycle
    // server as a side-effect.  AMP hooks (tool:pre-execute/post-execute)
    // cannot run external commands, so we piggyback on the permission
    // delegation mechanism instead.  The delegate is registered for a set
    // of safe, always-allowed tools (Read, Grep, edit_file, …) so it does
    // not weaken AMP's built-in security rules.
    let amp_delegate_script = r#"#!/bin/bash
# Autopilot AMP permission delegate — always allows, notifies lifecycle server
# Stdin: tool parameters (JSON) — consumed to prevent broken pipe
# Exit 0 = allow
cat > /dev/null 2>&1
[ -z "$AUTOPILOT_TERMINAL_ID" ] && exit 0
[ -z "$AUTOPILOT_HOOK_PORT" ] && exit 0

curl -sG "http://127.0.0.1:${AUTOPILOT_HOOK_PORT}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "terminalId=$AUTOPILOT_TERMINAL_ID" \
  --data-urlencode "eventType=Start" \
  > /dev/null 2>&1 &
exit 0
"#;

    let mut notify_script_path = None;
    if let Err(e) = write_hook_file(&notify_path, notify_script) {
        eprintln!("[autopilot] warning: failed to write notify hook script ({e})");
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            if let Err(e) = fs::set_permissions(&notify_path, fs::Permissions::from_mode(0o755)) {
                eprintln!(
                    "[autopilot] warning: failed to set notify hook script permissions ({}: {e})",
                    notify_path.display()
                );
            }
        }

        notify_script_path = Some(notify_path.to_string_lossy().to_string());
    }

    let mut amp_delegate = None;
    if let Err(e) = write_hook_file(&amp_delegate_path, amp_delegate_script) {
        eprintln!("[autopilot] warning: failed to write amp delegate script ({e})");
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            if let Err(e) =
                fs::set_permissions(&amp_delegate_path, fs::Permissions::from_mode(0o755))
            {
                eprintln!(
                    "[autopilot] warning: failed to set amp delegate script permissions ({}: {e})",
                    amp_delegate_path.display()
                );
            }
        }

        amp_delegate = Some(amp_delegate_path.to_string_lossy().to_string());
    }

    let mut claude_settings = None;
    if let Some(ref notify) = notify_script_path {
        let settings = json!({
            "hooks": {
                "UserPromptSubmit": [{"hooks": [{"type": "command", "command": notify}]}],
                "Stop": [{"hooks": [{"type": "command", "command": notify}]}],
                "PermissionRequest": [{"matcher": "*", "hooks": [{"type": "command", "command": notify}]}]
            }
        });

        match serde_json::to_string_pretty(&settings) {
            Ok(contents) => {
                if let Err(e) = write_hook_file(&claude_settings_path, &contents) {
                    eprintln!("[autopilot] warning: failed to write claude hook settings ({e})");
                } else {
                    claude_settings = Some(claude_settings_path.to_string_lossy().to_string());
                }
            }
            Err(e) => {
                eprintln!("[autopilot] warning: failed to serialize claude hook settings ({e})");
            }
        }
    }

    (notify_script_path, claude_settings, amp_delegate)
}

fn map_hook_event(event_type: &str) -> Option<(&'static str, bool)> {
    match event_type {
        "Start" | "UserPromptSubmit" | "SessionStart" => Some(("running", false)),
        "Stop" | "PermissionRequest" | "Notification" => Some(("waiting_input", true)),
        "SessionEnd" => Some(("completed", true)),
        _ => None,
    }
}

fn detect_agent_name_from_event(event_type: &str) -> &'static str {
    match event_type {
        "SessionStart" | "SessionEnd" | "SubagentStop" => "droid",
        "Start" | "Stop" | "UserPromptSubmit" | "PermissionRequest" | "Notification" => "claude",
        _ => "unknown",
    }
}

fn run_hook_server(
    app: AppHandle,
    agent_terminals: Arc<Mutex<HashMap<String, Arc<AgentTerminalInfo>>>>,
    terminal_worktrees: Arc<Mutex<HashMap<String, String>>>,
    server: Server,
) {
    thread::spawn(move || {
        for request in server.incoming_requests() {
            let url = request.url().to_string();

            if !url.starts_with("/hook/complete") {
                let _ = request.respond(Response::empty(StatusCode(404)));
                continue;
            }

            let terminal_id = parse_query_param(&url, "terminalId");
            let event_type = parse_query_param(&url, "eventType");

            if let (Some(terminal_id), Some(event_type)) = (terminal_id, event_type) {
                eprintln!(
                    "[autopilot:hook] received terminalId={terminal_id} eventType={event_type}"
                );
                if let Some((status, waiting)) = map_hook_event(&event_type) {
                    let info = {
                        let map = agent_terminals.lock();
                        map.get(&terminal_id).cloned()
                    };

                    let info = info.unwrap_or_else(|| {
                        let worktree_path = terminal_worktrees
                            .lock()
                            .get(&terminal_id)
                            .cloned()
                            .unwrap_or_default();
                        let agent = detect_agent_name_from_event(&event_type);
                        eprintln!(
                            "[autopilot:hook] creating AgentTerminalInfo on-the-fly for terminal={terminal_id} agent={agent} worktree={worktree_path}"
                        );
                        let new_info = Arc::new(AgentTerminalInfo {
                            worktree_path,
                            session_id: terminal_id.clone(),
                            agent: agent.to_string(),
                            last_output_ms: AtomicI64::new(now_ms()),
                            is_waiting: AtomicBool::new(true),
                            is_alive: AtomicBool::new(true),
                            hook_enabled: AtomicBool::new(true),
                        });
                        agent_terminals
                            .lock()
                            .insert(terminal_id.clone(), new_info.clone());
                        new_info
                    });

                    eprintln!(
                        "[autopilot:hook] -> status={status} agent={} worktree={}",
                        info.agent, info.worktree_path
                    );
                    info.is_waiting.store(waiting, Ordering::Relaxed);
                    info.last_output_ms.store(now_ms(), Ordering::Relaxed);
                    emit_agent_status(
                        &app,
                        &info.worktree_path,
                        &info.session_id,
                        &terminal_id,
                        status,
                        Some(&info.agent),
                        Some(format!("Hook event: {event_type}")),
                    );
                }
            } else {
                eprintln!("[autopilot:hook] missing params in request: {url}");
            }

            let _ = request.respond(Response::empty(StatusCode(200)));
        }
    });
}

fn install_hooks_to_claude_global_settings(notify_script_path: &str) {
    let Some(home_dir) = dirs::home_dir() else {
        return;
    };
    let settings_path = home_dir.join(".claude").join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        match fs::read_to_string(&settings_path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|_| json!({})),
            Err(_) => json!({}),
        }
    } else {
        if let Err(e) = fs::create_dir_all(settings_path.parent().unwrap()) {
            eprintln!("[autopilot] warning: failed to create ~/.claude directory ({e})");
            return;
        }
        json!({})
    };
    if !settings.is_object() {
        settings = json!({});
    }

    let hook_entry = json!([{
        "hooks": [{
            "type": "command",
            "command": notify_script_path
        }]
    }]);
    let permission_entry = json!([{
        "hooks": [{
            "type": "command",
            "command": notify_script_path
        }],
        "matcher": "*"
    }]);

    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));

    let hooks_obj = match hooks.as_object_mut() {
        Some(obj) => obj,
        None => {
            *hooks = json!({});
            hooks.as_object_mut().unwrap()
        }
    };

    fn entry_has_command(
        hooks_obj: &serde_json::Map<String, serde_json::Value>,
        key: &str,
        cmd: &str,
    ) -> bool {
        hooks_obj
            .get(key)
            .and_then(|v| v.as_array())
            .map_or(false, |a| {
                a.iter().any(|entry| {
                    entry
                        .pointer("/hooks/0/command")
                        .and_then(|v| v.as_str())
                        .map_or(false, |c| c == cmd)
                })
            })
    }

    let mut changed = false;

    for key in &["UserPromptSubmit", "Stop"] {
        if !entry_has_command(hooks_obj, key, notify_script_path) {
            if let Some(existing) = hooks_obj.get_mut(*key).and_then(|v| v.as_array_mut()) {
                existing.push(hook_entry[0].clone());
            } else {
                hooks_obj.insert(key.to_string(), hook_entry.clone());
            }
            changed = true;
        }
    }
    if !entry_has_command(hooks_obj, "PermissionRequest", notify_script_path) {
        if let Some(existing) = hooks_obj
            .get_mut("PermissionRequest")
            .and_then(|v| v.as_array_mut())
        {
            existing.push(permission_entry[0].clone());
        } else {
            hooks_obj.insert("PermissionRequest".to_string(), permission_entry);
        }
        changed = true;
    }

    if changed {
        match serde_json::to_string_pretty(&settings) {
            Ok(contents) => {
                if let Err(e) = fs::write(&settings_path, contents) {
                    eprintln!(
                        "[autopilot] warning: failed to write claude settings ({}: {e})",
                        settings_path.display()
                    );
                } else {
                    eprintln!(
                        "[autopilot] installed hooks into {}",
                        settings_path.display()
                    );
                }
            }
            Err(e) => {
                eprintln!("[autopilot] warning: failed to serialize claude settings ({e})");
            }
        }
    }
}

fn install_hooks_to_amp_global_settings(delegate_path: &str) {
    let Some(home_dir) = dirs::home_dir() else {
        return;
    };
    let config_dir = home_dir.join(".config").join("amp");
    let settings_path = config_dir.join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        match fs::read_to_string(&settings_path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|_| json!({})),
            Err(_) => json!({}),
        }
    } else {
        if let Err(e) = fs::create_dir_all(&config_dir) {
            eprintln!("[autopilot] warning: failed to create ~/.config/amp directory ({e})");
            return;
        }
        json!({})
    };
    if !settings.is_object() {
        settings = json!({});
    }

    let permissions = settings
        .as_object_mut()
        .unwrap()
        .entry("amp.permissions")
        .or_insert_with(|| json!([]));

    let arr = match permissions.as_array_mut() {
        Some(a) => a,
        None => {
            *permissions = json!([]);
            permissions.as_array_mut().unwrap()
        }
    };

    let already_installed = arr.iter().any(|entry| {
        entry
            .get("to")
            .and_then(|v| v.as_str())
            .map_or(false, |to| to == delegate_path)
    });

    if already_installed {
        return;
    }

    let delegate_tools = [
        "Read",
        "Grep",
        "glob",
        "finder",
        "edit_file",
        "create_file",
        "undo_edit",
        "Task",
    ];
    for tool in &delegate_tools {
        arr.push(json!({
            "tool": tool,
            "action": "delegate",
            "to": delegate_path
        }));
    }

    match serde_json::to_string_pretty(&settings) {
        Ok(contents) => {
            if let Err(e) = fs::write(&settings_path, contents) {
                eprintln!(
                    "[autopilot] warning: failed to write amp settings ({}: {e})",
                    settings_path.display()
                );
            } else {
                eprintln!(
                    "[autopilot] installed hooks into {}",
                    settings_path.display()
                );
            }
        }
        Err(e) => {
            eprintln!("[autopilot] warning: failed to serialize amp settings ({e})");
        }
    }
}

fn install_hooks_to_droid_global_settings(notify_script_path: &str) {
    let Some(home_dir) = dirs::home_dir() else {
        return;
    };
    let settings_path = home_dir.join(".factory").join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        match fs::read_to_string(&settings_path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|_| json!({})),
            Err(_) => json!({}),
        }
    } else {
        if let Err(e) = fs::create_dir_all(settings_path.parent().unwrap()) {
            eprintln!("[autopilot] warning: failed to create ~/.factory directory ({e})");
            return;
        }
        json!({})
    };
    if !settings.is_object() {
        settings = json!({});
    }

    let hook_entry = json!([{
        "hooks": [{
            "type": "command",
            "command": notify_script_path
        }]
    }]);

    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));

    let hooks_obj = match hooks.as_object_mut() {
        Some(obj) => obj,
        None => {
            *hooks = json!({});
            hooks.as_object_mut().unwrap()
        }
    };

    fn entry_has_command(
        hooks_obj: &serde_json::Map<String, serde_json::Value>,
        key: &str,
        cmd: &str,
    ) -> bool {
        hooks_obj
            .get(key)
            .and_then(|v| v.as_array())
            .map_or(false, |a| {
                a.iter().any(|entry| {
                    entry
                        .pointer("/hooks/0/command")
                        .and_then(|v| v.as_str())
                        .map_or(false, |c| c == cmd)
                })
            })
    }

    let mut changed = false;

    for key in &[
        "UserPromptSubmit",
        "Stop",
        "Notification",
        "SessionStart",
        "SessionEnd",
    ] {
        if !entry_has_command(hooks_obj, key, notify_script_path) {
            if let Some(existing) = hooks_obj.get_mut(*key).and_then(|v| v.as_array_mut()) {
                existing.push(hook_entry[0].clone());
            } else {
                hooks_obj.insert(key.to_string(), hook_entry.clone());
            }
            changed = true;
        }
    }

    if changed {
        match serde_json::to_string_pretty(&settings) {
            Ok(contents) => {
                if let Err(e) = fs::write(&settings_path, contents) {
                    eprintln!(
                        "[autopilot] warning: failed to write droid settings ({}: {e})",
                        settings_path.display()
                    );
                } else {
                    eprintln!(
                        "[autopilot] installed hooks into {}",
                        settings_path.display()
                    );
                }
            }
            Err(e) => {
                eprintln!("[autopilot] warning: failed to serialize droid settings ({e})");
            }
        }
    }
}

pub fn initialize_agent_hook_runtime(
    app: AppHandle,
    agent_terminals: Arc<Mutex<HashMap<String, Arc<AgentTerminalInfo>>>>,
    terminal_worktrees: Arc<Mutex<HashMap<String, String>>>,
) -> Option<AgentHookRuntime> {
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!("[autopilot] warning: failed to bind agent hook listener ({e})");
            return None;
        }
    };

    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(e) => {
            eprintln!("[autopilot] warning: failed to determine agent hook listener port ({e})");
            return None;
        }
    };

    let server = match Server::from_listener(listener, None) {
        Ok(server) => server,
        Err(e) => {
            eprintln!("[autopilot] warning: failed to start agent hook HTTP server ({e})");
            return None;
        }
    };

    eprintln!("[autopilot] agent hook HTTP server started on port {port}");
    run_hook_server(app, agent_terminals, terminal_worktrees, server);

    let mut notify_script_path = None;
    let mut claude_settings_path = None;

    if let Some(home_dir) = dirs::home_dir() {
        let hooks_dir = home_dir.join(".autopilot").join("hooks");

        if let Err(e) = fs::create_dir_all(&hooks_dir) {
            eprintln!(
                "[autopilot] warning: failed to create hook directory ({}: {e})",
                hooks_dir.display()
            );
        } else {
            let (notify, claude, amp_delegate) = setup_hook_files(&hooks_dir);
            notify_script_path = notify.clone();
            claude_settings_path = claude;

            if let Some(ref notify_path) = notify {
                install_hooks_to_claude_global_settings(notify_path);
                install_hooks_to_droid_global_settings(notify_path);
            }
            if let Some(ref delegate_path) = amp_delegate {
                install_hooks_to_amp_global_settings(delegate_path);
            }
        }
    } else {
        eprintln!(
            "[autopilot] warning: home directory unavailable, agent hooks script setup skipped"
        );
    }

    Some(AgentHookRuntime {
        port,
        notify_script_path,
        claude_settings_path,
    })
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
    is_dark_mode: bool,
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
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "Autopilot");
        cmd.env("COLORFGBG", if is_dark_mode { "231;16" } else { "16;231" });
    }

    if let Some(ref hook_runtime) = state.agent_hook_runtime {
        cmd.env("AUTOPILOT_TERMINAL_ID", &terminal_id);
        cmd.env("AUTOPILOT_HOOK_PORT", hook_runtime.port.to_string());
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let replay = Arc::new(Mutex::new(TerminalReplayBuffer::new(
        TERMINAL_REPLAY_MAX_BYTES,
    )));
    let session = TerminalSession {
        writer: Arc::new(Mutex::new(writer)),
        child,
        master: Arc::new(Mutex::new(pair.master)),
        replay: replay.clone(),
    };

    state.terminals.lock().insert(terminal_id.clone(), session);
    state
        .terminal_worktrees
        .lock()
        .insert(terminal_id.clone(), cwd.clone());

    let tid = terminal_id.clone();
    let app_clone = app.clone();
    let state_terminals = state.terminals.clone();
    let state_completed_terminal_outputs = state.completed_terminal_outputs.clone();
    let state_agent_terminals = state.agent_terminals.clone();

    let event_name = format!("terminal-output-{}", terminal_id);
    let close_event_name = format!("terminal-closed-{}", terminal_id);
    let replay_for_events = replay;

    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        let mut utf8_decoder = Utf8StreamDecoder::new();

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let flushed = utf8_decoder.flush();
                    emit_terminal_output(&app_clone, &event_name, &replay_for_events, flushed);
                    break;
                }
                Ok(n) => {
                    let decoded = utf8_decoder.push(&buf[..n]);
                    emit_terminal_output(&app_clone, &event_name, &replay_for_events, decoded);
                }
                Err(_) => {
                    let flushed = utf8_decoder.flush();
                    emit_terminal_output(&app_clone, &event_name, &replay_for_events, flushed);
                    break;
                }
            }
        }

        let snapshot = replay_for_events.lock().snapshot();
        {
            let mut terminals = state_terminals.lock();
            if terminals.remove(&tid).is_some() {
                state_completed_terminal_outputs.lock().insert(tid.clone(), snapshot);
            }
        }
        state_agent_terminals.lock().remove(&tid);
        let _ = app_clone.emit(&close_event_name, ());
    });

    Ok(TerminalSpawnResult { terminal_id })
}

#[tauri::command]
pub fn write_to_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let terminals = state.terminals.lock();
    let session = terminals.get(&terminal_id).ok_or("Terminal not found")?;

    let mut writer = session.writer.lock();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;

    if let Some(info) = state.agent_terminals.lock().get(&terminal_id) {
        if info.is_waiting.load(Ordering::Relaxed) && !info.hook_enabled.load(Ordering::Relaxed) {
            info.is_waiting.store(false, Ordering::Relaxed);
            info.last_output_ms.store(now_ms(), Ordering::Relaxed);
            emit_agent_status(
                &app,
                &info.worktree_path,
                &info.session_id,
                &terminal_id,
                "running",
                Some(&info.agent),
                Some("User input detected".to_string()),
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_terminal_output(
    state: State<'_, AppState>,
    terminal_id: String,
) -> Result<TerminalOutputSnapshot, String> {
    let live_snapshot = state
        .terminals
        .lock()
        .get(&terminal_id)
        .map(|session| session.replay.lock().snapshot());
    live_snapshot
        .or_else(|| state.completed_terminal_outputs.lock().get(&terminal_id))
        .ok_or("Terminal not found".to_string())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terminals = state.terminals.lock();
    let session = terminals.get(&terminal_id).ok_or("Terminal not found")?;

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

fn close_terminal_inner(state: &AppState, terminal_id: &str) -> Result<(), String> {
    if let Some(info) = state.agent_terminals.lock().remove(terminal_id) {
        info.is_alive.store(false, Ordering::Relaxed);
    }
    state.terminal_worktrees.lock().remove(terminal_id);
    let session = {
        let mut terminals = state.terminals.lock();
        state.completed_terminal_outputs.lock().remove(terminal_id);
        terminals.remove(terminal_id)
    };
    if let Some(session) = session {
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

#[tauri::command]
pub fn close_terminal(state: State<'_, AppState>, terminal_id: String) -> Result<(), String> {
    close_terminal_inner(&state, &terminal_id)
}

#[tauri::command]
pub fn close_terminals_for_worktree(
    state: State<'_, AppState>,
    worktree_path: String,
) -> Result<usize, String> {
    let canonical_worktree = fs::canonicalize(&worktree_path)
        .unwrap_or_else(|_| std::path::PathBuf::from(&worktree_path));
    let terminal_ids: Vec<String> = {
        let mut map = state.terminal_worktrees.lock();
        let mut ids = Vec::new();
        map.retain(|id, path| {
            if path.as_str() == worktree_path
                || std::path::Path::new(path.as_str()) == canonical_worktree
            {
                ids.push(id.clone());
                false
            } else {
                true
            }
        });
        ids
    };

    let mut closed = 0;
    for terminal_id in terminal_ids {
        if close_terminal_inner(&state, &terminal_id).is_ok() {
            closed += 1;
        }
    }

    Ok(closed)
}

/// Spawns a terminal that runs a specific command instead of a shell.
/// The terminal stays open after the command completes so user can see output.
#[tauri::command]
pub fn spawn_terminal_with_command(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
    command: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    is_dark_mode: bool,
) -> Result<TerminalSpawnResult, String> {
    let terminal_id = Uuid::new_v4().to_string();
    let session_id = terminal_id.clone();
    let detected_agent = detect_agent_from_command(&command);

    if let Some(agent) = detected_agent {
        emit_agent_status(
            &app,
            &cwd,
            &session_id,
            &terminal_id,
            "starting",
            Some(agent),
            Some("Command terminal is starting".to_string()),
        );
    }

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Run the command inside a shell so it has proper environment
    let shell = get_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // Build the full command string
    let mut full_command = if args.is_empty() {
        command
    } else {
        format!("{} {}", command, args.join(" "))
    };

    let mut hooks_injected = false;

    if let (Some(agent), Some(hook_runtime)) = (detected_agent, state.agent_hook_runtime.as_ref()) {
        eprintln!(
            "[autopilot] agent={agent} terminal={terminal_id} hook_port={} injecting env vars",
            hook_runtime.port
        );
        cmd.env("AUTOPILOT_TERMINAL_ID", &terminal_id);
        cmd.env("AUTOPILOT_HOOK_PORT", hook_runtime.port.to_string());

        if agent == "claude" {
            if let Some(settings_path) = hook_runtime.claude_settings_path.as_deref() {
                full_command = format!(
                    "{} --settings {}",
                    full_command,
                    shell_quote_single(settings_path)
                );
                hooks_injected = true;
                eprintln!("[autopilot] claude hooks injected, full_command={full_command}");
            } else {
                eprintln!("[autopilot] claude settings path missing, hooks NOT injected");
            }
        } else if agent == "codex" {
            if let Some(notify_script_path) = hook_runtime.notify_script_path.as_deref() {
                if let Ok(notify_json) = serde_json::to_string(&vec!["bash", notify_script_path]) {
                    let codex_notify = format!("notify={notify_json}");
                    full_command =
                        format!("{} -c {}", full_command, shell_quote_single(&codex_notify));
                    hooks_injected = true;
                    eprintln!("[autopilot] codex hooks injected, full_command={full_command}");
                }
            }
        } else if agent == "droid" {
            hooks_injected = true;
            eprintln!("[autopilot] droid hooks via global ~/.factory/settings.json");
        } else if agent == "opencode" {
            if let Some(home_dir) = dirs::home_dir() {
                let opencode_dir = home_dir.join(".autopilot").join("hooks");
                cmd.env(
                    "OPENCODE_CONFIG_DIR",
                    opencode_dir.to_string_lossy().to_string(),
                );
                hooks_injected = true;
                eprintln!(
                    "[autopilot] opencode hooks injected, config_dir={}",
                    opencode_dir.display()
                );
            }
        } else if agent == "amp" {
            // AMP uses permission delegation installed in ~/.config/amp/settings.json.
            // The delegate fires "Start" events on tool calls, giving us "running" signals.
            // We keep hooks_injected=false so the inactivity watchdog stays active for
            // "waiting_input" detection — AMP's hook system cannot send lifecycle events.
            eprintln!("[autopilot] amp lifecycle via permission delegate + watchdog");
        } else {
            eprintln!("[autopilot] agent={agent} has no hook support, using watchdog fallback");
        }
    } else if let Some(agent) = detected_agent {
        eprintln!("[autopilot] agent={agent} detected but hook runtime not available");
    }

    if cfg!(target_os = "windows") {
        cmd.arg("/k");
        cmd.arg(&full_command);
    } else {
        // login+interactive+cmd for bash/zsh; plain -c for other shells
        if should_wrap_shell(&shell) {
            cmd.arg("-lic");
        } else {
            cmd.arg("-c");
        }
        cmd.arg(format!("{}\n{} -li", full_command, shell));
    }

    cmd.cwd(&cwd);

    if !cfg!(target_os = "windows") {
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "Autopilot");
        cmd.env("COLORFGBG", if is_dark_mode { "231;16" } else { "16;231" });
    }

    let child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(e) => {
            if let Some(agent) = detected_agent {
                emit_agent_status(
                    &app,
                    &cwd,
                    &session_id,
                    &terminal_id,
                    "error",
                    Some(agent),
                    Some(format!("Failed to spawn command: {e}")),
                );
            }
            return Err(e.to_string());
        }
    };

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let replay = Arc::new(Mutex::new(TerminalReplayBuffer::new(
        TERMINAL_REPLAY_MAX_BYTES,
    )));
    let session = TerminalSession {
        writer: Arc::new(Mutex::new(writer)),
        child,
        master: Arc::new(Mutex::new(pair.master)),
        replay: replay.clone(),
    };

    state.terminals.lock().insert(terminal_id.clone(), session);
    state
        .terminal_worktrees
        .lock()
        .insert(terminal_id.clone(), cwd.clone());

    // -----------------------------------------------------------------------
    // Agent lifecycle tracking (inactivity watchdog + OSC 133/633 detection)
    // -----------------------------------------------------------------------

    let watchdog_state = detected_agent.map(|agent| {
        let info = Arc::new(AgentTerminalInfo {
            worktree_path: cwd.clone(),
            session_id: session_id.clone(),
            agent: agent.to_string(),
            last_output_ms: AtomicI64::new(now_ms()),
            is_waiting: AtomicBool::new(hooks_injected),
            is_alive: AtomicBool::new(true),
            hook_enabled: AtomicBool::new(hooks_injected),
        });
        state
            .agent_terminals
            .lock()
            .insert(terminal_id.clone(), info.clone());
        info
    });

    if let Some(ref ws) = watchdog_state {
        let ws_clone = ws.clone();
        let app_wd = app.clone();
        let tid_wd = terminal_id.clone();

        thread::spawn(move || loop {
            thread::sleep(Duration::from_millis(WATCHDOG_POLL_MS));

            if !ws_clone.is_alive.load(Ordering::Relaxed) {
                break;
            }

            let elapsed = now_ms() - ws_clone.last_output_ms.load(Ordering::Relaxed);
            let currently_waiting = ws_clone.is_waiting.load(Ordering::Relaxed);

            if elapsed >= INACTIVITY_TIMEOUT_MS
                && !currently_waiting
                && !ws_clone.hook_enabled.load(Ordering::Relaxed)
            {
                ws_clone.is_waiting.store(true, Ordering::Relaxed);
                emit_agent_status(
                    &app_wd,
                    &ws_clone.worktree_path,
                    &ws_clone.session_id,
                    &tid_wd,
                    "waiting_input",
                    Some(&ws_clone.agent),
                    Some(format!("No output for {}ms", elapsed)),
                );
            }
        });
    }

    let tid = terminal_id.clone();
    let app_clone = app.clone();
    let state_terminals = state.terminals.clone();
    let state_completed_terminal_outputs = state.completed_terminal_outputs.clone();
    let state_agent_terminals = state.agent_terminals.clone();
    let event_name = format!("terminal-output-{}", terminal_id);
    let close_event_name = format!("terminal-closed-{}", terminal_id);
    let cwd_for_events = cwd.clone();
    let agent_for_events = detected_agent.map(|v| v.to_string());
    let session_for_events = session_id.clone();
    let replay_for_events = replay;

    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        let mut utf8_decoder = Utf8StreamDecoder::new();
        let mut has_emitted_initial = false;
        let mut has_emitted_error = false;

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let flushed = utf8_decoder.flush();
                    emit_terminal_output(&app_clone, &event_name, &replay_for_events, flushed);
                    break;
                }
                Ok(n) => {
                    let data = utf8_decoder.push(&buf[..n]);

                    if data.is_empty() {
                        continue;
                    }

                    if let Some(agent) = agent_for_events.as_deref() {
                        let now = now_ms();

                        let is_hook_enabled = watchdog_state
                            .as_ref()
                            .map(|ws| ws.hook_enabled.load(Ordering::Relaxed))
                            .unwrap_or(false);

                        if let Some(ref ws) = watchdog_state {
                            ws.last_output_ms.store(now, Ordering::Relaxed);
                        }

                        if !has_emitted_initial {
                            if is_hook_enabled {
                                emit_agent_status(
                                    &app_clone,
                                    &cwd_for_events,
                                    &session_for_events,
                                    &tid,
                                    "waiting_input",
                                    Some(agent),
                                    Some("Agent started, waiting for first command".to_string()),
                                );
                            } else {
                                emit_agent_status(
                                    &app_clone,
                                    &cwd_for_events,
                                    &session_for_events,
                                    &tid,
                                    "running",
                                    Some(agent),
                                    Some("Received first output".to_string()),
                                );
                            }
                            has_emitted_initial = true;
                        }

                        if !is_hook_enabled && contains_osc_prompt_ready(&data) {
                            if let Some(ref ws) = watchdog_state {
                                if !ws.is_waiting.load(Ordering::Relaxed) {
                                    ws.is_waiting.store(true, Ordering::Relaxed);
                                    emit_agent_status(
                                        &app_clone,
                                        &cwd_for_events,
                                        &session_for_events,
                                        &tid,
                                        "waiting_input",
                                        Some(agent),
                                        Some("OSC 133/633 prompt-ready detected".to_string()),
                                    );
                                }
                            }
                        } else if !is_hook_enabled && contains_osc_command_executed(&data) {
                            if let Some(ref ws) = watchdog_state {
                                if ws.is_waiting.load(Ordering::Relaxed) {
                                    ws.is_waiting.store(false, Ordering::Relaxed);
                                    emit_agent_status(
                                        &app_clone,
                                        &cwd_for_events,
                                        &session_for_events,
                                        &tid,
                                        "running",
                                        Some(agent),
                                        Some("OSC 133/633 command-executed detected".to_string()),
                                    );
                                }
                            }
                        } else if !is_hook_enabled {
                            if let Some(ref ws) = watchdog_state {
                                if ws.is_waiting.load(Ordering::Relaxed) {
                                    ws.is_waiting.store(false, Ordering::Relaxed);
                                    emit_agent_status(
                                        &app_clone,
                                        &cwd_for_events,
                                        &session_for_events,
                                        &tid,
                                        "running",
                                        Some(agent),
                                        Some("Output resumed after idle".to_string()),
                                    );
                                }
                            }
                        }
                    }

                    emit_terminal_output(&app_clone, &event_name, &replay_for_events, data);
                }
                Err(e) => {
                    let flushed = utf8_decoder.flush();
                    emit_terminal_output(&app_clone, &event_name, &replay_for_events, flushed);
                    if let Some(agent) = agent_for_events.as_deref() {
                        emit_agent_status(
                            &app_clone,
                            &cwd_for_events,
                            &session_for_events,
                            &tid,
                            "error",
                            Some(agent),
                            Some(format!("Terminal stream error: {e}")),
                        );
                        has_emitted_error = true;
                    }
                    break;
                }
            }
        }

        if let Some(agent) = agent_for_events.as_deref() {
            let status = if has_emitted_error {
                "error"
            } else {
                "completed"
            };
            emit_agent_status(
                &app_clone,
                &cwd_for_events,
                &session_for_events,
                &tid,
                status,
                Some(agent),
                Some("Terminal session ended".to_string()),
            );
        }

        if let Some(ref ws) = watchdog_state {
            ws.is_alive.store(false, Ordering::Relaxed);
        }

        let snapshot = replay_for_events.lock().snapshot();
        {
            let mut terminals = state_terminals.lock();
            if terminals.remove(&tid).is_some() {
                state_completed_terminal_outputs.lock().insert(tid.clone(), snapshot);
            }
        }
        state_agent_terminals.lock().remove(&tid);
        let _ = app_clone.emit(&close_event_name, ());
    });

    Ok(TerminalSpawnResult { terminal_id })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_agent_known_commands() {
        assert_eq!(detect_agent_from_command("opencode"), Some("opencode"));
        assert_eq!(
            detect_agent_from_command("/usr/local/bin/opencode"),
            Some("opencode")
        );
        assert_eq!(detect_agent_from_command("claude"), Some("claude"));
        assert_eq!(detect_agent_from_command("droid"), Some("droid"));
        assert_eq!(detect_agent_from_command("amp"), Some("amp"));
        assert_eq!(detect_agent_from_command("codex"), Some("codex"));
        assert_eq!(detect_agent_from_command("  codex  --flag"), Some("codex"));
    }

    #[test]
    fn detect_agent_unknown_commands() {
        assert_eq!(detect_agent_from_command("ls -la"), None);
        assert_eq!(detect_agent_from_command(""), None);
        assert_eq!(detect_agent_from_command("npm start"), None);
    }

    #[test]
    fn osc_133_prompt_ready_standard() {
        assert!(contains_osc_prompt_ready("text\x1b]133;B\x07more"));
        assert!(contains_osc_prompt_ready("\x1b]633;B\x07"));
        assert!(contains_osc_prompt_ready("\x1b]133;B\x1b\\"));
        assert!(contains_osc_prompt_ready("\x1b]633;B\x1b\\"));
    }

    #[test]
    fn osc_133_prompt_ready_rejects_other() {
        assert!(!contains_osc_prompt_ready("\x1b]133;A\x07"));
        assert!(!contains_osc_prompt_ready("\x1b]133;C\x07"));
        assert!(!contains_osc_prompt_ready("plain text"));
    }

    #[test]
    fn osc_133_command_executed_standard() {
        assert!(contains_osc_command_executed("\x1b]133;C\x07"));
        assert!(contains_osc_command_executed("\x1b]633;C\x07"));
        assert!(contains_osc_command_executed("\x1b]133;C\x1b\\"));
    }

    #[test]
    fn osc_133_command_executed_rejects_other() {
        assert!(!contains_osc_command_executed("\x1b]133;B\x07"));
        assert!(!contains_osc_command_executed("plain text"));
    }

    #[test]
    fn parse_query_param_extracts_values() {
        let url = "/hook/complete?terminalId=abc-123&eventType=Stop";
        assert_eq!(
            parse_query_param(url, "terminalId"),
            Some("abc-123".to_string())
        );
        assert_eq!(
            parse_query_param(url, "eventType"),
            Some("Stop".to_string())
        );
        assert_eq!(parse_query_param(url, "missing"), None);
    }

    #[test]
    fn parse_query_param_no_query_string() {
        assert_eq!(parse_query_param("/hook/complete", "terminalId"), None);
    }

    #[test]
    fn parse_query_param_decodes_percent_encoding() {
        let url = "/hook/complete?name=hello%20world&path=%2Ffoo%2Fbar";
        assert_eq!(
            parse_query_param(url, "name"),
            Some("hello world".to_string())
        );
        assert_eq!(parse_query_param(url, "path"), Some("/foo/bar".to_string()));
    }

    #[test]
    fn parse_query_param_decodes_plus_as_space() {
        let url = "/hook/complete?name=hello+world";
        assert_eq!(
            parse_query_param(url, "name"),
            Some("hello world".to_string())
        );
    }

    #[test]
    fn percent_decode_passthrough() {
        assert_eq!(percent_decode("abc-123"), "abc-123");
        assert_eq!(percent_decode("Stop"), "Stop");
        assert_eq!(percent_decode("%2F"), "/");
        assert_eq!(percent_decode("a%20b%20c"), "a b c");
        assert_eq!(percent_decode("100%25done"), "100%done");
    }

    #[test]
    fn map_hook_event_known_types() {
        assert_eq!(map_hook_event("Start"), Some(("running", false)));
        assert_eq!(map_hook_event("UserPromptSubmit"), Some(("running", false)));
        assert_eq!(map_hook_event("SessionStart"), Some(("running", false)));
        assert_eq!(map_hook_event("Stop"), Some(("waiting_input", true)));
        assert_eq!(
            map_hook_event("PermissionRequest"),
            Some(("waiting_input", true))
        );
        assert_eq!(
            map_hook_event("Notification"),
            Some(("waiting_input", true))
        );
        assert_eq!(map_hook_event("SessionEnd"), Some(("completed", true)));
    }

    #[test]
    fn map_hook_event_unknown_types() {
        assert_eq!(map_hook_event("unknown"), None);
        assert_eq!(map_hook_event(""), None);
    }

    #[test]
    fn shell_quote_single_basic() {
        assert_eq!(shell_quote_single("hello"), "'hello'");
        assert_eq!(shell_quote_single("/path/to/file"), "'/path/to/file'");
    }

    #[test]
    fn shell_quote_single_with_quotes() {
        assert_eq!(shell_quote_single("it's"), "'it'\"'\"'s'");
    }

    #[test]
    fn terminal_replay_buffer_evicts_the_oldest_chunk_at_its_byte_limit() {
        let mut buffer = TerminalReplayBuffer::new(6);

        buffer.push("abc".to_string());
        buffer.push("def".to_string());
        buffer.push("ghi".to_string());

        assert_eq!(buffer.snapshot().data, "ghi");
    }

    #[test]
    fn completed_output_cache_evicts_the_oldest_snapshot_at_its_byte_limit() {
        let mut cache = CompletedTerminalOutputCache::new(6);

        cache.insert("first".to_string(), TerminalOutputSnapshot::new("abc", 1));
        cache.insert("second".to_string(), TerminalOutputSnapshot::new("def", 2));
        cache.insert("third".to_string(), TerminalOutputSnapshot::new("ghi", 3));

        assert!(cache.get("first").is_none());
        assert_eq!(
            cache.get("second").map(|snapshot| snapshot.data),
            Some("def".to_string())
        );
        assert_eq!(
            cache.get("third").map(|snapshot| snapshot.data),
            Some("ghi".to_string())
        );
    }

    #[test]
    fn completed_output_cache_limits_empty_snapshots() {
        let mut cache = CompletedTerminalOutputCache {
            entries: VecDeque::new(),
            bytes: 0,
            max_bytes: 1,
            max_entries: 2,
        };

        cache.insert("first".to_string(), TerminalOutputSnapshot::new("", 1));
        cache.insert("second".to_string(), TerminalOutputSnapshot::new("", 2));
        cache.insert("third".to_string(), TerminalOutputSnapshot::new("", 3));

        assert!(cache.get("first").is_none());
        assert!(cache.get("second").is_some());
        assert!(cache.get("third").is_some());
    }
}
