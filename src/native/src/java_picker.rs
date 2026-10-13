use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

const MAX_PATH_BYTES: usize = 32_768;
const MAX_PROBE_OUTPUT_BYTES: u64 = 8 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default, Clone)]
pub struct JavaSelectionStore {
    approved: Arc<Mutex<HashMap<String, PathBuf>>>,
}

impl JavaSelectionStore {
    fn clear(&self, window: &str) -> Result<(), String> {
        self.approved
            .lock()
            .map_err(|_| "Проверка Java временно недоступна".to_owned())?
            .remove(window);
        Ok(())
    }

    fn approve(&self, window: &str, selected: &Path) -> Result<String, String> {
        let canonical = canonical_regular_file(selected)?;
        let value = canonical
            .to_str()
            .filter(|value| value.len() <= MAX_PATH_BYTES)
            .ok_or_else(|| {
                "Путь к файлу Java слишком длинный или содержит неподдерживаемые символы".to_owned()
            })?
            .to_owned();
        self.approved
            .lock()
            .map_err(|_| "Проверка Java временно недоступна".to_owned())?
            .insert(window.to_owned(), canonical);
        Ok(value)
    }

    fn consume_approval(&self, window: &str, request: &str) -> Result<PathBuf, String> {
        if request.is_empty() || request.len() > MAX_PATH_BYTES || is_windows_unc(request) {
            return Err("Путь к Java недопустим".to_owned());
        }
        let approved = self
            .approved
            .lock()
            .map_err(|_| "Проверка Java временно недоступна".to_owned())?
            .remove(window)
            .ok_or_else(|| "Сначала выберите Java в системном окне".to_owned())?;
        if approved.to_str() != Some(request) {
            return Err("Путь не совпадает с выбранным файлом Java".to_owned());
        }
        let current = canonical_regular_file(&approved)?;
        if current != approved {
            return Err("Выбранный файл изменился, выберите его заново".to_owned());
        }
        if !is_java_executable(&approved) {
            return Err("Выберите файл java или javaw".to_owned());
        }
        Ok(approved)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JavaVerifyRequest {
    path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JavaVerification {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl JavaVerification {
    fn success(version: String) -> Self {
        Self {
            ok: true,
            version: Some(version),
            error: None,
        }
    }

    fn failure(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            version: None,
            error: Some(error.into()),
        }
    }
}

#[tauri::command]
pub async fn settings_pick_java(
    window: WebviewWindow,
    selection: tauri::State<'_, JavaSelectionStore>,
) -> Result<Option<String>, String> {
    let label = window.label().to_owned();
    selection.clear(&label)?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Выберите исполняемый файл Java")
        .pick_file(move |selected| {
            let _ = sender.send(selected);
        });
    let Some(selected) = receiver
        .await
        .map_err(|_| "Не удалось получить результат выбора Java".to_owned())?
    else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "Системный диалог вернул неподдерживаемый путь".to_owned())?;
    selection.approve(&label, &path).map(Some)
}

#[tauri::command]
pub async fn settings_verify_java(
    window: WebviewWindow,
    selection: tauri::State<'_, JavaSelectionStore>,
    request: JavaVerifyRequest,
) -> Result<JavaVerification, String> {
    let path = match selection.consume_approval(window.label(), &request.path) {
        Ok(path) => path,
        Err(error) => return Ok(JavaVerification::failure(error)),
    };
    match tokio::task::spawn_blocking(move || probe_java(&path)).await {
        Ok(Ok(version)) => Ok(JavaVerification::success(version)),
        Ok(Err(error)) => Ok(JavaVerification::failure(error)),
        Err(_) => Ok(JavaVerification::failure(
            "Проверка Java завершилась с ошибкой",
        )),
    }
}

fn canonical_regular_file(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() || is_windows_unc(path) {
        return Err("Выберите локальный файл Java".to_owned());
    }
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "Выбранный файл Java недоступен".to_owned())?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err("Выберите обычный файл Java без символических ссылок".to_owned());
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| "Не удалось определить полный путь к Java".to_owned())?;
    if is_windows_unc(&canonical) {
        return Err("Сетевые пути Java не поддерживаются".to_owned());
    }
    let canonical_metadata = fs::symlink_metadata(&canonical)
        .map_err(|_| "Выбранный файл Java недоступен".to_owned())?;
    if canonical_metadata.file_type().is_symlink() || !canonical_metadata.file_type().is_file() {
        return Err("Выберите обычный файл Java".to_owned());
    }
    Ok(canonical)
}

fn is_windows_unc(path: impl AsRef<Path>) -> bool {
    let value = path.as_ref().to_string_lossy().replace('/', "\\");
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("\\\\?\\unc\\") || lower.starts_with("\\\\.\\") {
        return true;
    }
    if let Some(rest) = lower.strip_prefix("\\\\?\\") {
        let bytes = rest.as_bytes();
        return !(bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes[2] == b'\\');
    }
    lower.starts_with("\\\\")
}

fn is_java_executable(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            matches!(
                name.to_ascii_lowercase().as_str(),
                "java" | "javaw" | "java.exe" | "javaw.exe"
            )
        })
}

fn probe_java(path: &Path) -> Result<String, String> {
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let mut command = Command::new(path);
    command
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Не удалось запустить выбранный файл Java".to_owned())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Не удалось проверить Java".to_owned())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Не удалось проверить Java".to_owned())?;
    let out_thread = read_limited(stdout);
    let err_thread = read_limited(stderr);
    let status = wait_bounded(&mut child, deadline)?;
    let output = [
        join_output_until(out_thread, deadline)?,
        join_output_until(err_thread, deadline)?,
    ]
    .concat();
    if !status.success() {
        return Err("Java завершилась с ошибкой при проверке".to_owned());
    }
    let text = String::from_utf8_lossy(&output);
    let version =
        parse_java_version(&text).ok_or_else(|| "Не удалось прочитать версию Java".to_owned())?;
    if java_major(&version).is_none_or(|major| major < 21) {
        return Err("Для игры требуется Java 21 или новее".to_owned());
    }
    Ok(version)
}

fn read_limited<R: Read + Send + 'static>(reader: R) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = reader.take(MAX_PROBE_OUTPUT_BYTES).read_to_end(&mut bytes);
        bytes
    })
}

fn wait_bounded(child: &mut Child, deadline: Instant) -> Result<std::process::ExitStatus, String> {
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(30));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Проверка Java превысила допустимое время".to_owned());
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Не удалось проверить выбранный файл Java".to_owned());
            }
        }
    }
}

fn join_output_until(
    reader: thread::JoinHandle<Vec<u8>>,
    deadline: Instant,
) -> Result<Vec<u8>, String> {
    while !reader.is_finished() {
        if Instant::now() >= deadline {
            return Err("Проверка Java превысила допустимое время".to_owned());
        }
        thread::sleep(Duration::from_millis(10));
    }
    reader
        .join()
        .map_err(|_| "Не удалось прочитать версию Java".to_owned())
}

fn parse_java_version(output: &str) -> Option<String> {
    for line in output.lines() {
        let version = if let Some((_, tail)) = line.split_once("version ") {
            tail.trim_start_matches(['\'', '"'])
                .split(['\'', '"', ' ', '\t'])
                .next()?
        } else if let Some(tail) = line.trim().strip_prefix("openjdk ") {
            tail.split([' ', '\t']).next()?
        } else {
            continue;
        };
        if java_major(version).is_some() && version.len() <= 128 {
            return Some(version.to_owned());
        }
    }
    None
}

fn java_major(version: &str) -> Option<u32> {
    let core = version.split(['-', '+']).next()?;
    let mut components = core.split('.');
    let first = components.next()?.parse::<u32>().ok()?;
    if first == 1 {
        components.next()?.parse().ok()
    } else {
        Some(first)
    }
}

#[cfg(test)]
#[path = "java_picker/tests.rs"]
mod tests;
