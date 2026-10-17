use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use atomicwrites::{AllowOverwrite, AtomicFile};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};

use crate::settings::SettingsStore;

/// A legacy offline profile. This type is intentionally separate from the
/// authenticated game-session credentials used by the launch pipeline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OfflineUser {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    #[serde(rename = "type")]
    pub auth_type: String,
}

/// Reads and writes the Electron-compatible offline profile file.
pub struct OfflineAuthService {
    minecraft_dir: PathBuf,
    operation_lock: Mutex<()>,
}

impl OfflineAuthService {
    pub fn from_settings(settings: &SettingsStore) -> Result<Self, String> {
        let minecraft_dir = settings.minecraft_dir()?;
        Ok(Self::new(minecraft_dir))
    }

    fn new(minecraft_dir: PathBuf) -> Self {
        Self {
            minecraft_dir,
            operation_lock: Mutex::new(()),
        }
    }

    /// Returns the saved offline profile, treating missing or malformed data
    /// as no profile just like the Electron service.
    pub fn get_user(&self) -> Option<OfflineUser> {
        let _guard = self.operation_lock.lock().ok()?;
        if !self.safe_minecraft_dir().ok()? {
            return None;
        }
        let auth_file = self.auth_file();
        let metadata = fs::symlink_metadata(&auth_file).ok()?;
        if !metadata.file_type().is_file() {
            return None;
        }
        let raw = fs::read_to_string(auth_file).ok()?;
        let user: OfflineUser = serde_json::from_str(&raw).ok()?;
        (user.auth_type == "offline" && user.access_token == "0").then_some(user)
    }

    pub fn login(&self, username: &str) -> Result<OfflineUser, String> {
        if !valid_username(username) {
            return Err(
                "username must contain 3 to 16 ASCII letters, digits, or underscores".into(),
            );
        }
        let _guard = self
            .operation_lock
            .lock()
            .map_err(|_| "offline auth lock is unavailable".to_owned())?;
        self.ensure_minecraft_dir().map_err(format_auth_error)?;
        let auth_file = self.auth_file();
        self.ensure_auth_target_is_safe(&auth_file)
            .map_err(format_auth_error)?;

        let user = OfflineUser {
            uuid: offline_uuid(username),
            username: username.to_owned(),
            access_token: "0".to_owned(),
            auth_type: "offline".to_owned(),
        };
        let bytes = serde_json::to_vec_pretty(&user)
            .map_err(|error| format!("offline auth serialization failed: {error}"))?;
        AtomicFile::new(&auth_file, AllowOverwrite)
            .write(|file| io::Write::write_all(file, &bytes))
            .map_err(|error| format_auth_error(io::Error::from(error)))?;
        Ok(user)
    }

    /// Keeps Electron's legacy profile in sync with a username validated by the account API.
    /// The online game token is deliberately not accepted or persisted by this method.
    pub(crate) fn sync_verified_username(&self, username: &str) -> Result<OfflineUser, String> {
        self.login(username)
    }

    /// Removes only `minecraft/auth.json`; unrelated files are left untouched.
    pub fn logout(&self) -> Result<(), String> {
        let _guard = self
            .operation_lock
            .lock()
            .map_err(|_| "offline auth lock is unavailable".to_owned())?;
        if !self.safe_minecraft_dir().map_err(format_auth_error)? {
            return Ok(());
        }
        match fs::remove_file(self.auth_file()) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format_auth_error(error)),
        }
    }

    fn auth_file(&self) -> PathBuf {
        self.minecraft_dir.join("auth.json")
    }

    fn ensure_minecraft_dir(&self) -> io::Result<()> {
        if self.safe_minecraft_dir()? {
            return Ok(());
        }
        fs::create_dir_all(&self.minecraft_dir)?;
        if self.safe_minecraft_dir()? {
            Ok(())
        } else {
            Err(invalid_minecraft_dir())
        }
    }

    fn safe_minecraft_dir(&self) -> io::Result<bool> {
        match fs::symlink_metadata(&self.minecraft_dir) {
            Ok(metadata) if metadata.file_type().is_dir() => Ok(true),
            Ok(_) => Err(invalid_minecraft_dir()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error),
        }
    }

    fn ensure_auth_target_is_safe(&self, auth_file: &Path) -> io::Result<()> {
        match fs::symlink_metadata(auth_file) {
            Ok(metadata) if metadata.file_type().is_file() => Ok(()),
            Ok(_) => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "offline auth path is not a regular file",
            )),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
}

fn invalid_minecraft_dir() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "Minecraft data path is not a regular directory",
    )
}

fn valid_username(username: &str) -> bool {
    (3..=16).contains(&username.len())
        && username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn offline_uuid(username: &str) -> String {
    let mut digest = Md5::new();
    digest.update("OfflinePlayer:");
    digest.update(username.as_bytes());
    let mut bytes = digest.finalize().to_vec();
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

fn format_auth_error(error: io::Error) -> String {
    format!("offline auth persistence failed: {error}")
}

#[cfg(test)]
#[path = "offline_auth/tests.rs"]
mod tests;
