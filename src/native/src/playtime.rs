use std::env;
use std::ffi::OsStr;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use atomicwrites::{AllowOverwrite, AtomicFile};
use serde::{Deserialize, Serialize};

const LEGACY_APP_NAME: &str = "natux-world-launcher";
const MAX_SESSIONS: usize = 30;
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(60);
const STALE_AFTER_MS: u64 = 300_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaytimeSession {
    pub(crate) start: u64,
    pub(crate) end: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaytimeStats {
    pub(crate) total_ms: u64,
    pub(crate) sessions: Vec<PlaytimeSession>,
    pub(crate) last_session: Option<PlaytimeSession>,
    pub(crate) in_game: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PlaytimeFile {
    total_ms: u64,
    sessions: Vec<PlaytimeSession>,
    active_start: Option<u64>,
    active_heartbeat: Option<u64>,
}

type Response<T> = Sender<Result<T, String>>;

enum Request {
    Begin(Response<()>),
    End(Response<()>),
    GetStats(Response<PlaytimeStats>),
    #[cfg(test)]
    Heartbeat(Response<bool>),
}

/// Serialized playtime actor. The channel is the read-modify-write queue: a tick
/// already in flight cannot store an old active snapshot after end_session.
pub(crate) struct PlaytimeService {
    sender: Option<Sender<Request>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl PlaytimeService {
    pub(crate) fn from_legacy_environment() -> io::Result<Self> {
        Self::new(legacy_user_data_dir()?.join("playtime.json"))
    }

    fn new(file: PathBuf) -> io::Result<Self> {
        let (sender, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("natux-playtime-store".to_owned())
            .spawn(move || run_actor(file, receiver))?;
        Ok(Self {
            sender: Some(sender),
            worker: Mutex::new(Some(worker)),
        })
    }

    pub(crate) fn begin_session(&self) -> Result<(), String> {
        self.request(Request::Begin)
    }

    pub(crate) fn end_session(&self) -> Result<(), String> {
        self.request(Request::End)
    }

    pub(crate) fn get_stats(&self) -> Result<PlaytimeStats, String> {
        self.request(Request::GetStats)
    }

    #[cfg(test)]
    fn heartbeat(&self) -> Result<bool, String> {
        self.request(Request::Heartbeat)
    }

    fn request<T>(&self, create: impl FnOnce(Response<T>) -> Request) -> Result<T, String> {
        let (reply, response) = mpsc::channel();
        self.sender
            .as_ref()
            .ok_or_else(|| "playtime service is stopping".to_owned())?
            .send(create(reply))
            .map_err(|_| "playtime service is unavailable".to_owned())?;
        response
            .recv()
            .map_err(|_| "playtime service stopped before replying".to_owned())?
    }
}

impl Drop for PlaytimeService {
    fn drop(&mut self) {
        // Final fallback for any shutdown path that drops the managed service
        // without first receiving Tauri's explicit RunEvent::Exit callback.
        let _ = self.end_session();
        self.sender.take();
        if let Ok(worker) = self.worker.get_mut() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}

fn run_actor(file: PathBuf, receiver: Receiver<Request>) {
    let mut active = false;
    loop {
        let request = if active {
            match receiver.recv_timeout(HEARTBEAT_INTERVAL) {
                Ok(request) => request,
                Err(RecvTimeoutError::Timeout) => {
                    active = heartbeat_file(&file, now_ms()).unwrap_or(true);
                    continue;
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        } else {
            match receiver.recv() {
                Ok(request) => request,
                Err(_) => break,
            }
        };

        match request {
            Request::Begin(reply) => {
                let result = begin_file(&file, now_ms()).map_err(format_error);
                if result.is_ok() {
                    active = true;
                }
                let _ = reply.send(result.map(|_| ()));
            }
            Request::End(reply) => {
                let result = end_file(&file, now_ms()).map_err(format_error);
                if let Ok(is_active) = result.as_ref() {
                    active = *is_active;
                }
                let _ = reply.send(result.map(|_| ()));
            }
            Request::GetStats(reply) => {
                let result = stats_file(&file, now_ms()).map_err(format_error);
                if let Ok((_, is_active)) = result.as_ref() {
                    active = *is_active;
                }
                let _ = reply.send(result.map(|(stats, _)| stats));
            }
            #[cfg(test)]
            Request::Heartbeat(reply) => {
                let result = heartbeat_file(&file, now_ms()).map_err(format_error);
                if let Ok(is_active) = result.as_ref() {
                    active = *is_active;
                }
                let _ = reply.send(result);
            }
        }
    }
}

fn begin_file(file: &Path, now: u64) -> io::Result<()> {
    let mut state = load(file)?;
    reconcile(&mut state, now);
    state.active_start.get_or_insert(now);
    state.active_heartbeat = state.active_start.map(|_| now);
    save(file, &state)
}

fn end_file(file: &Path, now: u64) -> io::Result<bool> {
    let mut state = load(file)?;
    let recovered = reconcile(&mut state, now);
    let Some(start) = state.active_start else {
        if recovered {
            save(file, &state)?;
        }
        return Ok(false);
    };

    let session = PlaytimeSession {
        start,
        end: now.max(start),
    };
    state.total_ms = state
        .total_ms
        .saturating_add(session.end.saturating_sub(session.start));
    push_session(&mut state, session);
    state.active_start = None;
    state.active_heartbeat = None;
    save(file, &state)?;
    Ok(false)
}

fn stats_file(file: &Path, now: u64) -> io::Result<(PlaytimeStats, bool)> {
    let mut state = load(file)?;
    let recovered = reconcile(&mut state, now);
    if recovered {
        save(file, &state)?;
    }
    let live = state
        .active_start
        .map(|start| now.saturating_sub(start))
        .unwrap_or(0);
    let last_session = state.sessions.last().cloned();
    let stats = PlaytimeStats {
        total_ms: state.total_ms.saturating_add(live),
        sessions: state.sessions,
        last_session,
        in_game: state.active_start.is_some(),
    };
    Ok((stats, state.active_start.is_some()))
}

fn heartbeat_file(file: &Path, now: u64) -> io::Result<bool> {
    let mut state = load(file)?;
    if state.active_start.is_none() {
        return Ok(false);
    }
    state.active_heartbeat = Some(now);
    save(file, &state)?;
    Ok(true)
}

fn load(file: &Path) -> io::Result<PlaytimeFile> {
    let bytes = match fs::read(file) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(PlaytimeFile::default()),
        Err(error) => return Err(error),
    };
    let mut state: PlaytimeFile = match serde_json::from_slice(&bytes) {
        Ok(state) => state,
        Err(_) => {
            crate::data_recovery::backup_corrupt_file(file)?;
            let state = PlaytimeFile::default();
            save(file, &state)?;
            state
        }
    };
    state
        .sessions
        .retain(|session| session.end >= session.start);
    state.sessions = state
        .sessions
        .into_iter()
        .rev()
        .take(MAX_SESSIONS)
        .collect();
    state.sessions.reverse();
    Ok(state)
}

fn save(file: &Path, state: &PlaytimeFile) -> io::Result<()> {
    let parent = file.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "playtime path has no parent")
    })?;
    fs::create_dir_all(parent)?;
    let bytes = serde_json::to_vec_pretty(state).map_err(io::Error::other)?;
    AtomicFile::new(file, AllowOverwrite)
        .write(|output| output.write_all(&bytes))
        .map_err(io::Error::from)
}

fn reconcile(state: &mut PlaytimeFile, now: u64) -> bool {
    let Some(start) = state.active_start else {
        return false;
    };
    let last_seen = state.active_heartbeat.unwrap_or(start);
    if now.saturating_sub(last_seen) <= STALE_AFTER_MS {
        return false;
    }

    let end = start.max(last_seen);
    state.total_ms = state.total_ms.saturating_add(end.saturating_sub(start));
    push_session(state, PlaytimeSession { start, end });
    state.active_start = None;
    state.active_heartbeat = None;
    true
}

fn push_session(state: &mut PlaytimeFile, session: PlaytimeSession) {
    state.sessions.push(session);
    if state.sessions.len() > MAX_SESSIONS {
        let excess = state.sessions.len() - MAX_SESSIONS;
        state.sessions.drain(..excess);
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

fn format_error(error: io::Error) -> String {
    format!("playtime persistence failed: {error}")
}

// Platform variants are cross-checked by unit tests on the Windows build host.
#[allow(dead_code)]
#[derive(Clone, Copy)]
enum LegacyPlatform {
    Windows,
    MacOs,
    Linux,
}

#[derive(Default)]
struct LegacyEnvironment<'a> {
    app_data: Option<&'a OsStr>,
    home: Option<&'a OsStr>,
    xdg_config: Option<&'a OsStr>,
}

fn legacy_user_data_dir() -> io::Result<PathBuf> {
    #[cfg(target_os = "windows")]
    let platform = LegacyPlatform::Windows;
    #[cfg(target_os = "macos")]
    let platform = LegacyPlatform::MacOs;
    #[cfg(target_os = "linux")]
    let platform = LegacyPlatform::Linux;
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "unsupported operating system",
    ));

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    legacy_user_data_dir_for(
        platform,
        LegacyEnvironment {
            app_data: env::var_os("APPDATA").as_deref(),
            home: env::var_os("HOME").as_deref(),
            xdg_config: env::var_os("XDG_CONFIG_HOME").as_deref(),
        },
    )
}

fn legacy_user_data_dir_for(
    platform: LegacyPlatform,
    environment: LegacyEnvironment<'_>,
) -> io::Result<PathBuf> {
    let root = match platform {
        LegacyPlatform::Windows => {
            required_absolute_path(LegacyPlatform::Windows, environment.app_data)?
        }
        LegacyPlatform::MacOs => required_absolute_path(LegacyPlatform::MacOs, environment.home)?
            .join("Library")
            .join("Application Support"),
        LegacyPlatform::Linux => match environment.xdg_config.map(Path::new) {
            Some(path) if is_absolute_for_platform(LegacyPlatform::Linux, path) => {
                path.to_path_buf()
            }
            _ => required_absolute_path(LegacyPlatform::Linux, environment.home)?.join(".config"),
        },
    };
    Ok(root.join(LEGACY_APP_NAME))
}

fn required_absolute_path(platform: LegacyPlatform, value: Option<&OsStr>) -> io::Result<PathBuf> {
    value
        .map(PathBuf::from)
        .filter(|path| is_absolute_for_platform(platform, path))
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "Electron userData root is unavailable",
            )
        })
}

fn is_absolute_for_platform(platform: LegacyPlatform, path: &Path) -> bool {
    match platform {
        LegacyPlatform::Windows => {
            let path = path.as_os_str().to_string_lossy().replace('/', "\\");
            path.starts_with("\\\\")
                || (path.len() >= 3
                    && path.as_bytes()[0].is_ascii_alphabetic()
                    && path.as_bytes()[1] == b':'
                    && path.as_bytes()[2] == b'\\')
        }
        LegacyPlatform::MacOs | LegacyPlatform::Linux => {
            path.as_os_str().to_string_lossy().starts_with('/')
        }
    }
}

#[cfg(test)]
#[path = "playtime/tests.rs"]
mod tests;
