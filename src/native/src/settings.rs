use std::env;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use atomicwrites::{AllowOverwrite, AtomicFile};
use serde::Serialize;
use serde_json::{Map, Value};
use uuid::Uuid;

const LEGACY_APP_NAME: &str = "natux-world-launcher";
const MIN_MEMORY_MIB: u64 = 512;
const MAX_MEMORY_MIB: u64 = 65_536;
const SETTING_FIELDS: &[&str] = &[
    "memory",
    "fullscreen",
    "closeOnLaunch",
    "language",
    "javaPath",
    "jvmArgs",
    "javaMode",
    "autoUpdate",
    "autoLaunch",
    "crashReports",
    "onboardingCompleted",
    "minimizeToTray",
    "launchOnStartup",
    "updateChannel",
    "telemetryEnabled",
    "installId",
    "startupSupported",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub memory: u64,
    pub fullscreen: bool,
    pub close_on_launch: bool,
    pub language: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub java_path: Option<String>,
    pub jvm_args: String,
    pub resolution: Resolution,
    pub java_mode: String,
    pub auto_update: bool,
    pub auto_launch: bool,
    pub crash_reports: bool,
    pub onboarding_completed: bool,
    pub minimize_to_tray: bool,
    pub launch_on_startup: bool,
    pub update_channel: String,
    pub telemetry_enabled: bool,
    pub install_id: String,
    #[serde(skip_serializing_if = "Option::is_none", skip_deserializing)]
    pub startup_supported: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Resolution {
    pub width: u64,
    pub height: u64,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            memory: 4096,
            fullscreen: false,
            close_on_launch: false,
            language: "ru".to_owned(),
            java_path: None,
            jvm_args: "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC".to_owned(),
            resolution: Resolution {
                width: 1280,
                height: 720,
            },
            java_mode: "bundled".to_owned(),
            auto_update: true,
            auto_launch: false,
            crash_reports: false,
            onboarding_completed: false,
            minimize_to_tray: false,
            launch_on_startup: false,
            update_channel: "stable".to_owned(),
            telemetry_enabled: false,
            install_id: String::new(),
            startup_supported: None,
        }
    }
}

/// Settings remain in Electron's userData directory so upgrades retain the same
/// settings.json and never select a Tauri-specific app-data directory by accident.
pub struct SettingsStore {
    file: PathBuf,
    operation_lock: Mutex<()>,
    extra_fields: Mutex<Map<String, Value>>,
}

impl SettingsStore {
    pub fn from_legacy_environment() -> io::Result<Self> {
        Ok(Self::new(legacy_settings_path_from_environment()?))
    }

    pub(crate) fn minecraft_dir(&self) -> Result<PathBuf, String> {
        self.file
            .parent()
            .map(|user_data| user_data.join("minecraft"))
            .ok_or_else(|| "legacy userData directory is unavailable".to_owned())
    }

    pub(crate) fn legacy_account_file(&self) -> Result<PathBuf, String> {
        self.file
            .parent()
            .map(|user_data| user_data.join("account.json"))
            .ok_or_else(|| "legacy userData directory is unavailable".to_owned())
    }

    fn new(file: PathBuf) -> Self {
        Self {
            file,
            operation_lock: Mutex::new(()),
            extra_fields: Mutex::new(Map::new()),
        }
    }

    pub fn get(&self) -> Result<LauncherSettings, String> {
        let _guard = self.lock()?;
        self.load_locked().map_err(format_settings_error)
    }

    pub fn set(&self, patch: Value) -> Result<LauncherSettings, String> {
        let patch = validate_patch(patch).map_err(format_settings_error)?;
        let _guard = self.lock()?;
        let mut current = self.load_locked().map_err(format_settings_error)?;
        apply_patch(&mut current, &patch);
        self.persist_locked(&current)
            .map_err(format_settings_error)?;
        Ok(current)
    }

    pub fn reset(&self) -> Result<LauncherSettings, String> {
        let _guard = self.lock()?;
        let current = self.load_locked().map_err(format_settings_error)?;
        let reset = LauncherSettings {
            install_id: current.install_id,
            ..LauncherSettings::default()
        };
        self.clear_extra_fields().map_err(format_settings_error)?;
        self.persist_locked(&reset).map_err(format_settings_error)?;
        Ok(reset)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ()>, String> {
        self.operation_lock
            .lock()
            .map_err(|_| "settings lock is unavailable".to_owned())
    }

    fn load_locked(&self) -> io::Result<LauncherSettings> {
        let raw = match fs::read(&self.file) {
            Ok(raw) => raw,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                self.clear_extra_fields()?;
                let defaults = LauncherSettings {
                    install_id: new_install_id(),
                    ..LauncherSettings::default()
                };
                self.persist_locked(&defaults)?;
                return Ok(defaults);
            }
            Err(error) => return Err(error),
        };

        let value: Value = match serde_json::from_slice(&raw) {
            Ok(value) => value,
            Err(_) => return self.recover_corrupt_locked(),
        };
        let Some(object) = value.as_object() else {
            return self.recover_corrupt_locked();
        };
        self.remember_extra_fields(object)?;
        let mut settings = LauncherSettings::default();
        apply_saved_values(&mut settings, object, true);

        if settings.install_id.is_empty() {
            settings.install_id = new_install_id();
            self.persist_locked(&settings)?;
        }
        Ok(settings)
    }

    fn recover_corrupt_locked(&self) -> io::Result<LauncherSettings> {
        crate::data_recovery::backup_corrupt_file(&self.file)?;
        self.clear_extra_fields()?;
        let defaults = LauncherSettings {
            install_id: new_install_id(),
            ..LauncherSettings::default()
        };
        self.persist_locked(&defaults)?;
        Ok(defaults)
    }

    fn persist_locked(&self, settings: &LauncherSettings) -> io::Result<()> {
        let parent = self.file.parent().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "settings path has no parent")
        })?;
        fs::create_dir_all(parent)?;
        let mut values = self
            .extra_fields
            .lock()
            .map_err(|_| io::Error::other("settings metadata lock is unavailable"))?
            .clone();
        let mut known_values = serde_json::to_value(settings)
            .map_err(io::Error::other)?
            .as_object()
            .cloned()
            .ok_or_else(|| io::Error::other("settings did not serialize as an object"))?;
        // Keep fields introduced by a newer launcher inside `resolution` while
        // ensuring the dimensions edited by this version remain authoritative.
        let known_resolution = known_values.remove("resolution");
        if let Some(known_resolution) = known_resolution {
            if let Some(saved_resolution) =
                values.get_mut("resolution").and_then(Value::as_object_mut)
            {
                if let Some(known_resolution) = known_resolution.as_object() {
                    saved_resolution.extend(known_resolution.clone());
                }
            } else {
                values.insert("resolution".to_owned(), known_resolution);
            }
        }
        values.extend(known_values);
        let bytes = serde_json::to_vec_pretty(&Value::Object(values)).map_err(io::Error::other)?;
        AtomicFile::new(&self.file, AllowOverwrite)
            .write(|file| io::Write::write_all(file, &bytes))
            .map_err(io::Error::from)
    }

    fn remember_extra_fields(&self, values: &Map<String, Value>) -> io::Result<()> {
        let extras = values
            .iter()
            .filter(|(key, _)| !SETTING_FIELDS.contains(&key.as_str()))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        *self
            .extra_fields
            .lock()
            .map_err(|_| io::Error::other("settings metadata lock is unavailable"))? = extras;
        Ok(())
    }

    fn clear_extra_fields(&self) -> io::Result<()> {
        self.extra_fields
            .lock()
            .map_err(|_| io::Error::other("settings metadata lock is unavailable"))?
            .clear();
        Ok(())
    }
}

fn format_settings_error(error: io::Error) -> String {
    format!("settings persistence failed: {error}")
}

fn new_install_id() -> String {
    Uuid::new_v4().to_string()
}

fn validate_patch(value: Value) -> io::Result<Map<String, Value>> {
    value.as_object().cloned().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "settings patch must be an object",
        )
    })
}

fn apply_saved_values(
    settings: &mut LauncherSettings,
    values: &Map<String, Value>,
    include_install_id: bool,
) {
    if let Some(memory) = bounded_integer(values.get("memory"), MIN_MEMORY_MIB, MAX_MEMORY_MIB) {
        settings.memory = memory;
    }
    apply_booleans(settings, values);
    if let Some(language) = values.get("language").and_then(Value::as_str) {
        if matches!(language, "ru" | "en") {
            settings.language = language.to_owned();
        }
    }
    if let Some(java_path) = values.get("javaPath") {
        settings.java_path = match java_path {
            Value::String(path) if path.len() <= 32_768 => Some(path.clone()),
            Value::Null => None,
            _ => None,
        };
    }
    if let Some(args) = values.get("jvmArgs").and_then(Value::as_str) {
        if args.len() <= 32_768 {
            settings.jvm_args = args.to_owned();
        }
    }
    apply_saved_resolution(settings, values.get("resolution"));
    if let Some(mode) = values.get("javaMode").and_then(Value::as_str) {
        if matches!(mode, "bundled" | "custom") {
            settings.java_mode = mode.to_owned();
        }
    }
    if let Some(channel) = values.get("updateChannel").and_then(Value::as_str) {
        if matches!(channel, "stable" | "beta") {
            settings.update_channel = channel.to_owned();
        }
    }
    if include_install_id {
        if let Some(install_id) = values.get("installId").and_then(Value::as_str) {
            if !install_id.trim().is_empty() && install_id.len() <= 128 {
                settings.install_id = install_id.to_owned();
            }
        }
    }
}

fn apply_patch(settings: &mut LauncherSettings, patch: &Map<String, Value>) {
    // Renderer-supplied installId and unknown properties are deliberately ignored.
    apply_saved_values(settings, patch, false);
}

fn apply_booleans(settings: &mut LauncherSettings, values: &Map<String, Value>) {
    let fields = [
        ("fullscreen", &mut settings.fullscreen),
        ("closeOnLaunch", &mut settings.close_on_launch),
        ("autoUpdate", &mut settings.auto_update),
        ("autoLaunch", &mut settings.auto_launch),
        ("crashReports", &mut settings.crash_reports),
        ("onboardingCompleted", &mut settings.onboarding_completed),
        ("minimizeToTray", &mut settings.minimize_to_tray),
        ("launchOnStartup", &mut settings.launch_on_startup),
        ("telemetryEnabled", &mut settings.telemetry_enabled),
    ];
    for (key, field) in fields {
        if let Some(value) = values.get(key) {
            *field = value.as_bool() == Some(true);
        }
    }
}

fn apply_saved_resolution(settings: &mut LauncherSettings, value: Option<&Value>) {
    let Some(value) = value else { return };
    let resolution = value.as_object();
    settings.resolution.width =
        bounded_integer(resolution.and_then(|object| object.get("width")), 640, 7680)
            .unwrap_or(1280);
    settings.resolution.height = bounded_integer(
        resolution.and_then(|object| object.get("height")),
        480,
        4320,
    )
    .unwrap_or(720);
}

fn bounded_integer(value: Option<&Value>, minimum: u64, maximum: u64) -> Option<u64> {
    let number = value?.as_f64()?;
    if !number.is_finite() {
        return None;
    }
    Some((number.floor() as u64).clamp(minimum, maximum))
}

// All three roots are covered by the resolver tests, though only the current
// target's variant is constructed by production code on a given build host.
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

fn legacy_user_data_dir(
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
        .ok_or_else(missing_legacy_root)
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

fn missing_legacy_root() -> io::Error {
    io::Error::new(
        io::ErrorKind::NotFound,
        "cannot resolve Electron userData root from APPDATA, XDG_CONFIG_HOME, or HOME",
    )
}

fn legacy_settings_path_from_environment() -> io::Result<PathBuf> {
    if let Some(directory) = crate::profile_paths::portable_user_data_dir()? {
        return Ok(directory.join("settings.json"));
    }
    #[cfg(target_os = "windows")]
    let platform = LegacyPlatform::Windows;
    #[cfg(target_os = "macos")]
    let platform = LegacyPlatform::MacOs;
    #[cfg(target_os = "linux")]
    let platform = LegacyPlatform::Linux;
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "unsupported operating system for Electron userData compatibility",
    ));

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    legacy_user_data_dir(
        platform,
        LegacyEnvironment {
            app_data: env::var_os("APPDATA").as_deref(),
            home: env::var_os("HOME").as_deref(),
            xdg_config: env::var_os("XDG_CONFIG_HOME").as_deref(),
        },
    )
    .map(|directory| directory.join("settings.json"))
}

#[cfg(test)]
#[path = "settings/tests.rs"]
mod tests;
