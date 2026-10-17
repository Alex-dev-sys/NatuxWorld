use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::settings::SettingsStore;

const MAX_EXTERNAL_URL_BYTES: usize = 8_192;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellOpenResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ShellOpenResult {
    fn success() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }

    fn failure(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(error.into()),
        }
    }
}

#[tauri::command]
pub fn shell_open_external(app: AppHandle, url: String) -> Result<(), String> {
    validate_external_url(&url).map_err(str::to_owned)?;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn shell_open_screenshots(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    profile_locks: State<'_, crate::ProfileLockState>,
) -> ShellOpenResult {
    let _game_lock = match profile_locks.acquire_game() {
        Ok(lock) => lock,
        Err(error) => return ShellOpenResult::failure(error),
    };
    let root = match settings.minecraft_dir() {
        Ok(root) => root,
        Err(error) => return ShellOpenResult::failure(error),
    };
    let screenshots = match ensure_screenshots_directory(&root) {
        Ok(path) => path,
        Err(error) => return ShellOpenResult::failure(error),
    };
    let Some(path) = screenshots.to_str() else {
        return ShellOpenResult::failure("Путь к папке снимков содержит неподдерживаемые символы");
    };
    match app.opener().open_path(path, None::<&str>) {
        Ok(()) => ShellOpenResult::success(),
        Err(error) => ShellOpenResult::failure(error.to_string()),
    }
}

fn validate_external_url(raw: &str) -> Result<(), &'static str> {
    if raw.is_empty()
        || raw.len() > MAX_EXTERNAL_URL_BYTES
        || raw.trim() != raw
        || raw
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err("Некорректный адрес ссылки");
    }
    if raw.starts_with("mailto:") {
        return validate_mailto(raw);
    }
    let parsed = Url::parse(raw).map_err(|_| "Некорректный адрес ссылки")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Разрешены только ссылки http и https");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() || has_url_user_info(raw) {
        return Err("Ссылки с данными пользователя запрещены");
    }
    Ok(())
}

fn has_url_user_info(raw: &str) -> bool {
    raw.split_once("://")
        .and_then(|(_, rest)| rest.split(['/', '?', '#']).next())
        .is_some_and(|authority| authority.contains('@'))
}

fn validate_mailto(raw: &str) -> Result<(), &'static str> {
    let Some(address) = raw.strip_prefix("mailto:") else {
        return Err("Некорректный адрес электронной почты");
    };
    let Some((local, domain)) = address.split_once('@') else {
        return Err("Некорректный адрес электронной почты");
    };
    if address.len() > 254
        || address.matches('@').count() != 1
        || address
            .chars()
            .any(|character| matches!(character, '?' | '#' | '%' | ',' | ';' | ':' | '/' | '\\'))
        || !valid_email_local(local)
        || !valid_email_domain(domain)
    {
        return Err("Некорректный адрес электронной почты");
    }
    Ok(())
}

fn valid_email_local(local: &str) -> bool {
    !local.is_empty()
        && local.len() <= 64
        && !local.starts_with('.')
        && !local.ends_with('.')
        && !local.contains("..")
        && local
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-'))
}

fn valid_email_domain(domain: &str) -> bool {
    let labels: Vec<&str> = domain.split('.').collect();
    labels.len() >= 2
        && labels.iter().all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label.as_bytes()[0].is_ascii_alphanumeric()
                && label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
        && labels.last().is_some_and(|label| {
            label.len() >= 2 && label.bytes().all(|byte| byte.is_ascii_alphabetic())
        })
}

fn ensure_screenshots_directory(minecraft_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(minecraft_dir)
        .map_err(|_| "Не удалось создать папку Minecraft".to_owned())?;
    let root_metadata =
        fs::symlink_metadata(minecraft_dir).map_err(|_| "Папка Minecraft недоступна".to_owned())?;
    if root_metadata.file_type().is_symlink() || !root_metadata.file_type().is_dir() {
        return Err("Папка Minecraft должна быть обычной директорией".to_owned());
    }
    let root = minecraft_dir
        .canonicalize()
        .map_err(|_| "Не удалось определить папку Minecraft".to_owned())?;
    let screenshots = root.join("screenshots");
    match fs::symlink_metadata(&screenshots) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err("Папка снимков не может быть символической ссылкой".to_owned());
        }
        Ok(metadata) if !metadata.file_type().is_dir() => {
            return Err("Путь снимков не является папкой".to_owned());
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&screenshots)
                .map_err(|_| "Не удалось создать папку снимков".to_owned())?;
        }
        Err(_) => return Err("Папка снимков недоступна".to_owned()),
    }
    let metadata =
        fs::symlink_metadata(&screenshots).map_err(|_| "Папка снимков недоступна".to_owned())?;
    let canonical = screenshots
        .canonicalize()
        .map_err(|_| "Не удалось определить папку снимков".to_owned())?;
    if metadata.file_type().is_symlink()
        || !metadata.file_type().is_dir()
        || !canonical.starts_with(&root)
    {
        return Err("Папка снимков находится за пределами папки Minecraft".to_owned());
    }
    Ok(canonical)
}

#[cfg(test)]
#[path = "shell_integration/tests.rs"]
mod tests;
