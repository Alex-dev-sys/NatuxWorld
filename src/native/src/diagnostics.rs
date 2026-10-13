//! Read-only health checks exposed by the launcher support panel.

use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::io::Read;
#[cfg(unix)]
use std::process::{Command, Stdio};
#[cfg(unix)]
use std::thread;

use reqwest::redirect::Policy;
use reqwest::{Client, StatusCode, Url};
use serde::Serialize;
use sysinfo::System;

use crate::java::{self, JavaTarget};

mod updates;

const SITE_ORIGIN: &str = "https://vibestudy.ru";
const SITE_PATH: &str = "/api/server/status";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
const MAX_RESPONSE_BYTES: usize = 16 * 1024;
const MIN_FREE_BYTES: u64 = 1536 * 1024 * 1024;
#[cfg(unix)]
const DISK_PROBE_TIMEOUT: Duration = Duration::from_secs(3);
#[cfg(unix)]
const MAX_DISK_OUTPUT_BYTES: usize = 8192;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCheck {
    pub id: String,
    pub label: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

struct SiteProbe {
    status: StatusCode,
    latency_ms: u64,
}

pub struct DiagnosticsService {
    client: Client,
    updates: updates::UpdateDiagnostics,
    base_url: Url,
    minecraft_dir: PathBuf,
    #[cfg(test)]
    allow_localhost_test: bool,
}

impl DiagnosticsService {
    pub fn new(minecraft_dir: PathBuf) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()
            .map_err(|_| "не удалось подготовить сетевую проверку".to_owned())?;
        let updates = updates::UpdateDiagnostics::new()
            .map_err(|_| "не удалось подготовить проверку канала обновлений".to_owned())?;
        Ok(Self {
            client,
            updates,
            base_url: Url::parse(SITE_ORIGIN).expect("trusted website origin is valid"),
            minecraft_dir,
            #[cfg(test)]
            allow_localhost_test: false,
        })
    }

    /// Runs Java, disk, website, updater and memory checks without changing user data.
    pub async fn run(&self) -> Vec<DiagnosticCheck> {
        let runtime_dir = self.minecraft_dir.join("runtime");
        let java_task = tokio::task::spawn_blocking(move || check_java(&runtime_dir));
        let disk_dir = self.minecraft_dir.clone();
        let disk_task = tokio::task::spawn_blocking(move || check_disk(&disk_dir));
        let memory_task = tokio::task::spawn_blocking(check_memory);
        let site_task = self.check_site();
        let updates_task = self.updates.run();

        let (java, disk, memory, site, updates) =
            tokio::join!(java_task, disk_task, memory_task, site_task, updates_task);
        vec![
            java.unwrap_or_else(|_| failed_check("java", "Java 21+", "Проверка Java прервана")),
            disk.unwrap_or_else(|_| failed_check("disk", "Место на диске", "Не удалось проверить")),
            site,
            updates,
            memory.unwrap_or_else(|_| failed_check("memory", "Память", "Не удалось проверить")),
        ]
    }

    async fn check_site(&self) -> DiagnosticCheck {
        match self.probe_site().await {
            Ok(probe) if probe.status.is_success() => DiagnosticCheck {
                id: "site".to_owned(),
                label: "Сайт и авторизация".to_owned(),
                ok: true,
                detail: Some(format!("Ответ за {} мс", probe.latency_ms)),
            },
            Ok(probe) => DiagnosticCheck {
                id: "site".to_owned(),
                label: "Сайт и авторизация".to_owned(),
                ok: false,
                detail: Some(format!(
                    "HTTP {} · Ответ за {} мс",
                    probe.status.as_u16(),
                    probe.latency_ms
                )),
            },
            Err(ProbeError::TooLarge) => failed_check(
                "site",
                "Сайт и авторизация",
                "Ответ сайта превышает допустимый размер",
            ),
            Err(ProbeError::Unavailable) => failed_check(
                "site",
                "Сайт и авторизация",
                "Нет ответа — проверьте интернет",
            ),
        }
    }

    async fn probe_site(&self) -> Result<SiteProbe, ProbeError> {
        let endpoint = self.site_endpoint().ok_or(ProbeError::Unavailable)?;
        let started = Instant::now();
        let mut response = self
            .client
            .get(endpoint.clone())
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::USER_AGENT, "NatuxWorldLauncher")
            .send()
            .await
            .map_err(|_| ProbeError::Unavailable)?;

        if response.url() != &endpoint || !self.url_is_trusted(response.url()) {
            return Err(ProbeError::Unavailable);
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(ProbeError::TooLarge);
        }

        let mut received = 0usize;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| ProbeError::Unavailable)?
        {
            received = received.saturating_add(chunk.len());
            if received > MAX_RESPONSE_BYTES {
                return Err(ProbeError::TooLarge);
            }
        }
        Ok(SiteProbe {
            status: response.status(),
            latency_ms: started.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
        })
    }

    fn site_endpoint(&self) -> Option<Url> {
        let endpoint = self.base_url.join(SITE_PATH).ok()?;
        self.url_is_trusted(&endpoint).then_some(endpoint)
    }

    fn url_is_trusted(&self, url: &Url) -> bool {
        if !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return false;
        }
        #[cfg(test)]
        if self.allow_localhost_test {
            return url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.port().is_some()
                && url.port() == self.base_url.port();
        }
        url.scheme() == "https"
            && url.host_str() == Some("vibestudy.ru")
            && url.port().is_none_or(|port| port == 443)
    }

    #[cfg(test)]
    fn for_localhost_test(minecraft_dir: PathBuf, origin: Url) -> Option<Self> {
        if origin.scheme() != "http"
            || origin.host_str() != Some("127.0.0.1")
            || origin.port().is_none()
            || origin.path() != "/"
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
        {
            return None;
        }
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()
            .ok()?;
        let updates = updates::UpdateDiagnostics::for_localhost_test(origin.clone())?;
        Some(Self {
            client,
            updates,
            base_url: origin,
            minecraft_dir,
            allow_localhost_test: true,
        })
    }
}

#[derive(Debug)]
enum ProbeError {
    Unavailable,
    TooLarge,
}

fn check_java(runtime_dir: &Path) -> DiagnosticCheck {
    let found = JavaTarget::current()
        .ok()
        .and_then(|target| java::detect(runtime_dir, target));
    match found {
        Some(found) => DiagnosticCheck {
            id: "java".to_owned(),
            label: "Java 21+".to_owned(),
            ok: true,
            detail: Some(format!("{} ({})", found.version, found.vendor)),
        },
        None => failed_check(
            "java",
            "Java 21+",
            "Не найдена — будет установлена автоматически при запуске",
        ),
    }
}

fn check_disk(minecraft_dir: &Path) -> DiagnosticCheck {
    match free_bytes(minecraft_dir) {
        Ok(free) => {
            let free_gb = format_gigabytes(free);
            if free >= MIN_FREE_BYTES {
                DiagnosticCheck {
                    id: "disk".to_owned(),
                    label: "Место на диске".to_owned(),
                    ok: true,
                    detail: Some(format!("Свободно {free_gb}")),
                }
            } else {
                DiagnosticCheck {
                    id: "disk".to_owned(),
                    label: "Место на диске".to_owned(),
                    ok: false,
                    detail: Some(format!(
                        "Свободно {free_gb}, для игры нужно ~{}",
                        format_gigabytes(MIN_FREE_BYTES)
                    )),
                }
            }
        }
        Err(_) => failed_check("disk", "Место на диске", "Не удалось проверить"),
    }
}

fn check_memory() -> DiagnosticCheck {
    let mut system = System::new();
    system.refresh_memory();
    check_memory_total(system.total_memory())
}

fn check_memory_total(total_bytes: u64) -> DiagnosticCheck {
    let total_gb = total_bytes as f64 / 1024_f64.powi(3);
    DiagnosticCheck {
        id: "memory".to_owned(),
        label: "Память".to_owned(),
        ok: total_bytes >= 4 * 1024 * 1024 * 1024,
        detail: Some(format!(
            "{total_gb:.1} GB · v{} · {}/{}",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH
        )),
    }
}

fn failed_check(id: &str, label: &str, detail: &str) -> DiagnosticCheck {
    DiagnosticCheck {
        id: id.to_owned(),
        label: label.to_owned(),
        ok: false,
        detail: Some(detail.to_owned()),
    }
}

fn format_gigabytes(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1024_f64.powi(3))
}

fn free_bytes(path: &Path) -> io::Result<u64> {
    let existing = path
        .ancestors()
        .find(|candidate| fs_is_directory(candidate))
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no existing directory"))?;

    #[cfg(windows)]
    {
        free_bytes_windows(existing)
    }
    #[cfg(unix)]
    {
        free_bytes_unix(existing)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = existing;
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "disk space probing is unsupported on this platform",
        ))
    }
}

fn fs_is_directory(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|metadata| metadata.is_dir())
}

#[cfg(windows)]
fn free_bytes_windows(path: &Path) -> io::Result<u64> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "Kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory_name: *const u16,
            free_bytes_available: *mut u64,
            total_bytes: *mut u64,
            total_free_bytes: *mut u64,
        ) -> i32;
    }

    let directory: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    // SAFETY: `directory` is a valid NUL-terminated UTF-16 path and all output
    // pointers refer to initialized `u64` values that live through the call.
    let success = unsafe {
        GetDiskFreeSpaceExW(
            directory.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if success == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(available)
    }
}

#[cfg(unix)]
fn free_bytes_unix(path: &Path) -> io::Result<u64> {
    let mut child = Command::new("df")
        .args(["-Pk"])
        .arg(path)
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("df stdout is unavailable"))?;
    let reader = thread::spawn(move || read_capped(stdout, MAX_DISK_OUTPUT_BYTES));
    let deadline = Instant::now() + DISK_PROBE_TIMEOUT;
    let status = loop {
        match child.try_wait()? {
            Some(status) => break status,
            None if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
            None => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "df probe timed out",
                ));
            }
        }
    };
    let output = reader
        .join()
        .map_err(|_| io::Error::other("df output reader failed"))??;
    if !status.success() || output.len() > MAX_DISK_OUTPUT_BYTES {
        return Err(io::Error::other("df probe failed"));
    }
    let text = String::from_utf8_lossy(&output);
    text.lines()
        .rev()
        .find_map(|line| {
            let kib = line.split_whitespace().nth(3)?.parse::<u64>().ok()?;
            Some(kib.saturating_mul(1024))
        })
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "df output is invalid"))
}

#[cfg(unix)]
fn read_capped(mut reader: impl Read, maximum: usize) -> io::Result<Vec<u8>> {
    let mut captured = Vec::with_capacity(maximum.min(4096));
    let mut overflow = false;
    let mut buffer = [0; 1024];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        let remaining = maximum.saturating_sub(captured.len());
        captured.extend_from_slice(&buffer[..count.min(remaining)]);
        overflow |= count > remaining;
    }
    if overflow {
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "df output is too large",
        ))
    } else {
        Ok(captured)
    }
}

#[cfg(test)]
#[path = "diagnostics/tests.rs"]
mod tests;
