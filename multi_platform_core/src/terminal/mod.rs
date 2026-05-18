use anyhow::{anyhow, Context, Result};
#[cfg(feature = "napi")]
use napi_derive::napi;
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(feature = "napi")]
use crate::event::EventSink;

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalProfile {
    pub id: String,
    pub label: String,
    pub command: String,
    pub args: Vec<String>,
    pub is_default: bool,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionDescriptor {
    pub session_id: String,
    pub profile_id: String,
    pub profile_label: String,
    pub cwd: Option<String>,
    pub attached_target: String,
    pub status: String,
    pub process_id: Option<u32>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalSessionInput {
    pub profile_id: Option<String>,
    pub profile_label: Option<String>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub rows: u32,
    pub cols: u32,
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub attached_target: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResizeTerminalSessionInput {
    pub session_id: String,
    pub rows: u32,
    pub cols: u32,
    pub pixel_width: u32,
    pub pixel_height: u32,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalEventEnvelope {
    pub event_type: String,
    pub session_id: String,
    pub data: Option<String>,
    pub status: Option<String>,
    pub attached_target: Option<String>,
    pub message: Option<String>,
    pub process_id: Option<u32>,
    pub exit_code: Option<u32>,
    pub signal: Option<String>,
}

type SessionsMap = HashMap<String, Arc<TerminalSession>>;

struct TerminalSession {
    descriptor: Mutex<TerminalSessionDescriptor>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

struct TerminalSessionManagerInner {
    sessions: RwLock<SessionsMap>,
    #[cfg(feature = "napi")]
    event_sink: Mutex<Option<EventSink>>,
    next_session_id: AtomicU64,
}

#[derive(Clone)]
pub struct TerminalSessionManager {
    inner: Arc<TerminalSessionManagerInner>,
}

impl Default for TerminalSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalSessionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(TerminalSessionManagerInner {
                sessions: RwLock::new(HashMap::new()),
                #[cfg(feature = "napi")]
                event_sink: Mutex::new(None),
                next_session_id: AtomicU64::new(1),
            }),
        }
    }

    pub fn list_profiles(&self) -> Vec<TerminalProfile> {
        detect_terminal_profiles()
    }

    pub fn list_sessions(&self) -> Result<Vec<TerminalSessionDescriptor>> {
        let sessions = self
            .inner
            .sessions
            .read()
            .map_err(|_| anyhow!("terminal session registry poisoned"))?;

        let mut descriptors = Vec::with_capacity(sessions.len());
        for session in sessions.values() {
            let descriptor = session
                .descriptor
                .lock()
                .map_err(|_| anyhow!("terminal session descriptor poisoned"))?
                .clone();
            descriptors.push(descriptor);
        }
        Ok(descriptors)
    }

    pub fn create_session(
        &self,
        input: CreateTerminalSessionInput,
    ) -> Result<TerminalSessionDescriptor> {
        let profiles = self.list_profiles();
        let has_command_override = input
            .command
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());
        if profiles.is_empty() && !has_command_override {
            return Err(anyhow!("no terminal profiles available for this platform"));
        }

        let profile = resolve_profile(
            &profiles,
            input.profile_id.as_deref(),
            input.command.as_deref(),
            input.profile_label.as_deref(),
        )?;
        let session_id = self.next_session_id();
        let cwd = normalize_cwd(input.cwd.clone())?;
        let attached_target = input
            .attached_target
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "main".to_string());

        let size = PtySize {
            rows: clamp_dimension(input.rows),
            cols: clamp_dimension(input.cols),
            pixel_width: clamp_dimension(input.pixel_width),
            pixel_height: clamp_dimension(input.pixel_height),
        };

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(size)
            .context("failed to open portable pty")?;

        let mut command = CommandBuilder::new(profile.command.clone());
        for arg in build_command_args(&profile, input.args.as_ref()) {
            command.arg(arg);
        }
        if let Some(cwd_value) = cwd.as_ref() {
            command.cwd(cwd_value);
        }
        if let Some(env_pairs) = input.env.as_ref() {
            for (key, value) in env_pairs {
                command.env(key, value);
            }
        }

        let child = pair
            .slave
            .spawn_command(command)
            .with_context(|| format!("failed to spawn shell `{}`", profile.command))?;

        let process_id = child.process_id();
        let killer = child.clone_killer();
        let reader = pair
            .master
            .try_clone_reader()
            .context("failed to clone pty reader")?;
        let writer = pair
            .master
            .take_writer()
            .context("failed to acquire pty writer")?;

        let descriptor = TerminalSessionDescriptor {
            session_id: session_id.clone(),
            profile_id: profile.id.clone(),
            profile_label: profile.label.clone(),
            cwd,
            attached_target,
            status: "running".to_string(),
            process_id,
        };

        let session = Arc::new(TerminalSession {
            descriptor: Mutex::new(descriptor.clone()),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
        });

        self.inner
            .sessions
            .write()
            .map_err(|_| anyhow!("terminal session registry poisoned"))?
            .insert(session_id.clone(), session);

        self.spawn_reader_thread(session_id.clone(), reader);
        self.spawn_wait_thread(session_id.clone(), child);
        self.emit_event(TerminalEventEnvelope {
            event_type: "state".to_string(),
            session_id,
            data: None,
            status: Some("running".to_string()),
            attached_target: Some(descriptor.attached_target.clone()),
            message: Some("session created".to_string()),
            process_id,
            exit_code: None,
            signal: None,
        });

        Ok(descriptor)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<()> {
        let session = self.get_session(session_id)?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| anyhow!("terminal session writer poisoned"))?;
        writer
            .write_all(data.as_bytes())
            .with_context(|| format!("failed to write to session `{session_id}`"))?;
        writer.flush().ok();
        Ok(())
    }

    pub fn resize_session(&self, input: ResizeTerminalSessionInput) -> Result<()> {
        let session = self.get_session(&input.session_id)?;
        let master = session
            .master
            .lock()
            .map_err(|_| anyhow!("terminal session master poisoned"))?;
        master
            .resize(PtySize {
                rows: clamp_dimension(input.rows),
                cols: clamp_dimension(input.cols),
                pixel_width: clamp_dimension(input.pixel_width),
                pixel_height: clamp_dimension(input.pixel_height),
            })
            .with_context(|| format!("failed to resize session `{}`", input.session_id))?;
        Ok(())
    }

    pub fn kill_session(&self, session_id: &str) -> Result<()> {
        let session = self.get_session(session_id)?;
        {
            let mut descriptor = session
                .descriptor
                .lock()
                .map_err(|_| anyhow!("terminal session descriptor poisoned"))?;
            descriptor.status = "terminating".to_string();
        }
        {
            let mut killer = session
                .killer
                .lock()
                .map_err(|_| anyhow!("terminal session killer poisoned"))?;
            if let Err(err) = killer.kill() {
                eprintln!("[terminal] warning: failed to kill session `{session_id}` (may have already exited): {err}");
            }
        }
        self.emit_event(TerminalEventEnvelope {
            event_type: "state".to_string(),
            session_id: session_id.to_string(),
            data: None,
            status: Some("terminating".to_string()),
            attached_target: None,
            message: Some("kill requested".to_string()),
            process_id: None,
            exit_code: None,
            signal: None,
        });
        Ok(())
    }

    pub fn attach_session(&self, session_id: &str, target: &str) -> Result<()> {
        self.update_attached_target(session_id, target)
    }

    pub fn close_detached_view(&self, session_id: &str, target: &str) -> Result<()> {
        let session = self.get_session(session_id)?;
        let mut descriptor = session
            .descriptor
            .lock()
            .map_err(|_| anyhow!("terminal session descriptor poisoned"))?;
        if descriptor.attached_target == target {
            descriptor.attached_target = "main".to_string();
            self.emit_event(TerminalEventEnvelope {
                event_type: "state".to_string(),
                session_id: descriptor.session_id.clone(),
                data: None,
                status: Some(descriptor.status.clone()),
                attached_target: Some(descriptor.attached_target.clone()),
                message: Some("detached view closed".to_string()),
                process_id: descriptor.process_id,
                exit_code: None,
                signal: None,
            });
        }
        Ok(())
    }

    #[cfg(feature = "napi")]
    pub fn register_event_sink(&self, sink: EventSink) -> Result<()> {
        crate::event::register_event_sink(&self.inner.event_sink, sink, "terminal")
    }

    fn update_attached_target(&self, session_id: &str, target: &str) -> Result<()> {
        let session = self.get_session(session_id)?;
        let mut descriptor = session
            .descriptor
            .lock()
            .map_err(|_| anyhow!("terminal session descriptor poisoned"))?;
        descriptor.attached_target = normalize_target(target);
        self.emit_event(TerminalEventEnvelope {
            event_type: "state".to_string(),
            session_id: descriptor.session_id.clone(),
            data: None,
            status: Some(descriptor.status.clone()),
            attached_target: Some(descriptor.attached_target.clone()),
            message: Some("session attached".to_string()),
            process_id: descriptor.process_id,
            exit_code: None,
            signal: None,
        });
        Ok(())
    }

    fn get_session(&self, session_id: &str) -> Result<Arc<TerminalSession>> {
        self.inner
            .sessions
            .read()
            .map_err(|_| anyhow!("terminal session registry poisoned"))?
            .get(session_id)
            .cloned()
            .ok_or_else(|| anyhow!("terminal session `{session_id}` not found"))
    }

    fn next_session_id(&self) -> String {
        let counter = self.inner.next_session_id.fetch_add(1, Ordering::SeqCst);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or(0);
        format!("terminal-{timestamp}-{counter}")
    }

    fn spawn_reader_thread(&self, session_id: String, mut reader: Box<dyn Read + Send>) {
        let manager = self.clone();
        thread::spawn(move || {
            let mut buffer = vec![0_u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read_size) => {
                        let data = String::from_utf8_lossy(&buffer[..read_size]).to_string();
                        manager.emit_event(TerminalEventEnvelope {
                            event_type: "data".to_string(),
                            session_id: session_id.clone(),
                            data: Some(data),
                            status: None,
                            attached_target: None,
                            message: None,
                            process_id: None,
                            exit_code: None,
                            signal: None,
                        });
                    }
                    Err(error) => {
                        manager.emit_event(TerminalEventEnvelope {
                            event_type: "error".to_string(),
                            session_id: session_id.clone(),
                            data: None,
                            status: None,
                            attached_target: None,
                            message: Some(format!("terminal reader failed: {error}")),
                            process_id: None,
                            exit_code: None,
                            signal: None,
                        });
                        break;
                    }
                }
            }
        });
    }

    fn spawn_wait_thread(&self, session_id: String, mut child: Box<dyn Child + Send + Sync>) {
        let manager = self.clone();
        thread::spawn(move || {
            let exit_result = child.wait();
            let (process_id, attached_target) = manager
                .inner
                .sessions
                .read()
                .ok()
                .and_then(|sessions| sessions.get(&session_id).cloned())
                .and_then(|session| session.descriptor.lock().ok().map(|value| value.clone()))
                .map(|descriptor| (descriptor.process_id, descriptor.attached_target))
                .unwrap_or((None, "main".to_string()));

            manager
                .inner
                .sessions
                .write()
                .ok()
                .and_then(|mut sessions| sessions.remove(&session_id));

            match exit_result {
                Ok(exit_status) => {
                    manager.emit_event(TerminalEventEnvelope {
                        event_type: "exit".to_string(),
                        session_id,
                        data: None,
                        status: Some("exited".to_string()),
                        attached_target: Some(attached_target),
                        message: Some("session exited".to_string()),
                        process_id,
                        exit_code: Some(exit_status.exit_code()),
                        signal: exit_status.signal().map(|value| value.to_string()),
                    });
                }
                Err(error) => {
                    manager.emit_event(TerminalEventEnvelope {
                        event_type: "error".to_string(),
                        session_id,
                        data: None,
                        status: Some("failed".to_string()),
                        attached_target: Some(attached_target),
                        message: Some(format!("terminal process wait failed: {error}")),
                        process_id,
                        exit_code: None,
                        signal: None,
                    });
                }
            }
        });
    }

    fn emit_event(&self, _event: TerminalEventEnvelope) {
        #[cfg(feature = "napi")]
        {
            crate::event::emit_serialized_event(&self.inner.event_sink, &_event, "terminal");
        }
    }
}

fn resolve_profile(
    profiles: &[TerminalProfile],
    profile_id: Option<&str>,
    command: Option<&str>,
    profile_label: Option<&str>,
) -> Result<TerminalProfile> {
    if let Some(command) = command.map(str::trim).filter(|value| !value.is_empty()) {
        let id = profile_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("custom");
        let label = profile_label
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(command);
        return Ok(TerminalProfile {
            id: id.to_string(),
            label: label.to_string(),
            command: command.to_string(),
            args: Vec::new(),
            is_default: false,
        });
    }

    if let Some(profile_id) = profile_id {
        if let Some(profile) = profiles.iter().find(|profile| profile.id == profile_id) {
            return Ok(profile.clone());
        }
    }

    profiles
        .iter()
        .find(|profile| profile.is_default)
        .or_else(|| profiles.first())
        .cloned()
        .ok_or_else(|| anyhow!("no terminal profile found"))
}

fn normalize_cwd(value: Option<String>) -> Result<Option<String>> {
    match value {
        Some(cwd) if !cwd.trim().is_empty() => Ok(Some(cwd)),
        _ => env::current_dir()
            .ok()
            .map(|value| Some(value.to_string_lossy().to_string()))
            .ok_or_else(|| anyhow!("failed to resolve current working directory")),
    }
}

fn normalize_target(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "main".to_string()
    } else {
        trimmed.to_string()
    }
}

fn clamp_dimension(value: u32) -> u16 {
    value.clamp(1, u16::MAX as u32) as u16
}

fn build_command_args(profile: &TerminalProfile, extra_args: Option<&Vec<String>>) -> Vec<String> {
    #[cfg(windows)]
    {
        if is_windows_powershell_profile(profile) && extra_args.is_none_or(|args| args.is_empty()) {
            return vec![
                "-NoLogo".to_string(),
                "-NoProfile".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                build_windows_powershell_profile_bootstrap_command(),
            ];
        }
    }

    let mut args = profile.args.clone();
    if let Some(extra_args) = extra_args {
        args.extend(extra_args.iter().cloned());
    }
    args
}

fn detect_terminal_profiles() -> Vec<TerminalProfile> {
    #[cfg(windows)]
    {
        detect_windows_profiles()
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        detect_unix_profiles()
    }

    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn detect_windows_profiles() -> Vec<TerminalProfile> {
    let candidates = [
        (
            "pwsh",
            "PowerShell 7",
            "pwsh.exe",
            vec!["-NoLogo".to_string()],
        ),
        (
            "powershell",
            "Windows PowerShell",
            "powershell.exe",
            vec!["-NoLogo".to_string()],
        ),
        ("cmd", "Command Prompt", "cmd.exe", Vec::new()),
    ];

    let mut profiles = Vec::new();
    for (index, (id, label, command, args)) in candidates.iter().enumerate() {
        if command_exists(command) {
            profiles.push(TerminalProfile {
                id: (*id).to_string(),
                label: (*label).to_string(),
                command: (*command).to_string(),
                args: args.clone(),
                is_default: index == 0,
            });
        }
    }

    if profiles.is_empty() {
        profiles.push(TerminalProfile {
            id: "cmd".to_string(),
            label: "Command Prompt".to_string(),
            command: "cmd.exe".to_string(),
            args: Vec::new(),
            is_default: true,
        });
    } else {
        mark_first_as_default(&mut profiles);
    }

    profiles
}

#[cfg(windows)]
fn is_windows_powershell_profile(profile: &TerminalProfile) -> bool {
    matches!(profile.id.as_str(), "pwsh" | "powershell")
}

#[cfg(windows)]
fn build_windows_powershell_profile_bootstrap_command() -> String {
    concat!(
        "$__terminalProfileStopwatch = [System.Diagnostics.Stopwatch]::StartNew(); ",
        "$__terminalProfiles = @(",
        "$PROFILE.AllUsersAllHosts, ",
        "$PROFILE.AllUsersCurrentHost, ",
        "$PROFILE.CurrentUserAllHosts, ",
        "$PROFILE.CurrentUserCurrentHost",
        ") | Select-Object -Unique; ",
        "foreach ($__terminalProfile in $__terminalProfiles) { ",
        "if ($__terminalProfile -and (Test-Path $__terminalProfile)) { ",
        ". $__terminalProfile ",
        "} ",
        "}; ",
        "$__terminalProfileStopwatch.Stop(); ",
        "[Console]::WriteLine(\"Loading personal and system profiles took {0}ms.\" -f $__terminalProfileStopwatch.ElapsedMilliseconds)",
    )
    .to_string()
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn detect_unix_profiles() -> Vec<TerminalProfile> {
    let mut profiles = Vec::new();
    let mut seen_ids = HashMap::<String, ()>::new();

    if let Ok(shell_path) = env::var("SHELL") {
        let path = PathBuf::from(&shell_path);
        if path.exists() {
            let id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("shell")
                .to_string();
            seen_ids.insert(id.clone(), ());
            profiles.push(TerminalProfile {
                id,
                label: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Login Shell")
                    .to_string(),
                command: shell_path,
                args: Vec::new(),
                is_default: true,
            });
        }
    }

    for (id, label, command) in [
        ("bash", "Bash", "bash"),
        ("zsh", "Zsh", "zsh"),
        ("sh", "POSIX Shell", "sh"),
    ] {
        if seen_ids.contains_key(id) || !command_exists(command) {
            continue;
        }
        profiles.push(TerminalProfile {
            id: id.to_string(),
            label: label.to_string(),
            command: command.to_string(),
            args: Vec::new(),
            is_default: false,
        });
    }

    if profiles.is_empty() {
        profiles.push(TerminalProfile {
            id: "sh".to_string(),
            label: "POSIX Shell".to_string(),
            command: "sh".to_string(),
            args: Vec::new(),
            is_default: true,
        });
    } else {
        mark_first_as_default(&mut profiles);
    }

    profiles
}

fn mark_first_as_default(profiles: &mut [TerminalProfile]) {
    for (index, profile) in profiles.iter_mut().enumerate() {
        profile.is_default = index == 0;
    }
}

fn command_exists(command: &str) -> bool {
    let command_path = Path::new(command);
    if command_path.components().count() > 1 {
        return command_path.exists();
    }

    let path_var = env::var_os("PATH");
    let Some(path_var) = path_var else {
        return false;
    };

    let extensions = command_extensions(command);
    env::split_paths(&path_var).any(|dir| {
        extensions.iter().any(|ext| {
            let candidate = if ext.is_empty() {
                dir.join(command)
            } else {
                dir.join(format!("{command}{ext}"))
            };
            candidate.exists()
        })
    })
}

fn command_extensions(command: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        if Path::new(command).extension().is_some() {
            return vec![String::new()];
        }

        return env::var("PATHEXT")
            .ok()
            .map(|value| {
                value
                    .split(';')
                    .filter(|part| !part.trim().is_empty())
                    .map(|part| part.to_string())
                    .collect::<Vec<_>>()
            })
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| vec![".exe".to_string(), ".cmd".to_string(), ".bat".to_string()]);
    }

    #[cfg(not(windows))]
    {
        let _ = command;
        vec![String::new()]
    }
}
