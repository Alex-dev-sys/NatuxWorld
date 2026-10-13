//! Java 21 runtime metadata, probing, and managed installation helpers.
//!
//! This module is Rust-only and is not a Tauri command surface. It creates
//! download jobs only for validated Temurin package metadata.

use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;

use crate::cancellation::CancellationToken;
use crate::downloads::DownloadJob;
use crate::launcher::retry::{is_transient_http_status, retry_transient, RetryFailure};

mod archive;
mod probe;

#[allow(unused_imports)]
pub use probe::{
    detect, install_release, is_java_21_plus, java_executable_relative_path, managed_java_path,
    parse_java_version, probe_java, system_java_command,
};
pub(crate) use probe::{detect_cancelable, install_release_cancelable};

#[cfg(test)]
#[path = "java/tests.rs"]
mod tests;

pub const JAVA_MAJOR_VERSION: u8 = 21;
const METADATA_TIMEOUT: Duration = Duration::from_secs(20);
const METADATA_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_METADATA_BYTES: usize = 2 * 1024 * 1024;
const DOWNLOAD_ROOT: &str = "runtime";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JavaOs {
    Windows,
    Mac,
    Linux,
}

impl JavaOs {
    pub const fn adoptium_name(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Mac => "mac",
            Self::Linux => "linux",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JavaArch {
    X64,
    Aarch64,
}

impl JavaArch {
    pub const fn adoptium_name(self) -> &'static str {
        match self {
            Self::X64 => "x64",
            Self::Aarch64 => "aarch64",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JavaTarget {
    pub os: JavaOs,
    pub arch: JavaArch,
}

impl JavaTarget {
    #[cfg(test)]
    pub const fn new(os: JavaOs, arch: JavaArch) -> Self {
        Self { os, arch }
    }

    /// Returns only targets for which Temurin 21 JRE packages are requested.
    pub fn current() -> Result<Self, String> {
        let os = if cfg!(target_os = "windows") {
            JavaOs::Windows
        } else if cfg!(target_os = "macos") {
            JavaOs::Mac
        } else if cfg!(target_os = "linux") {
            JavaOs::Linux
        } else {
            return Err("Temurin 21 is not configured for this operating system".to_owned());
        };

        let arch = if cfg!(target_arch = "x86_64") {
            JavaArch::X64
        } else if cfg!(target_arch = "aarch64") {
            JavaArch::Aarch64
        } else {
            return Err("Temurin 21 is not configured for this CPU architecture".to_owned());
        };

        Ok(Self { os, arch })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveKind {
    Zip,
    TarGz,
}

impl ArchiveKind {
    fn from_filename(name: &str) -> Option<Self> {
        if name.ends_with(".zip") {
            Some(Self::Zip)
        } else if name.ends_with(".tar.gz") {
            Some(Self::TarGz)
        } else {
            None
        }
    }

    fn expected_for(os: JavaOs) -> Self {
        match os {
            JavaOs::Windows => Self::Zip,
            JavaOs::Mac | JavaOs::Linux => Self::TarGz,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemurinRelease {
    pub target: JavaTarget,
    pub version: String,
    pub package_name: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub archive: ArchiveKind,
}

impl TemurinRelease {
    /// Downloader destinations are relative to the launcher Minecraft data root.
    pub fn download_job(&self) -> DownloadJob {
        DownloadJob {
            url: self.url.clone(),
            destination: PathBuf::from(DOWNLOAD_ROOT).join(&self.package_name),
            expected_sha1: None,
            expected_sha256: Some(self.sha256.clone()),
            expected_size: Some(self.size),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct JavaInstallation {
    pub version: String,
    pub vendor: String,
    pub path: String,
}

pub(crate) async fn detect_cancelable_blocking(
    runtime_dir: PathBuf,
    target: JavaTarget,
    cancellation: CancellationToken,
) -> Result<Option<JavaInstallation>, String> {
    tokio::task::spawn_blocking(move || detect_cancelable(&runtime_dir, target, &cancellation))
        .await
        .map_err(|_| "Java version probe failed".to_owned())?
}

#[derive(Debug, Deserialize)]
struct ReleaseMetadata {
    vendor: Option<String>,
    project: Option<String>,
    version_data: Option<VersionData>,
    binaries: Option<Vec<BinaryMetadata>>,
}

#[derive(Debug, Deserialize)]
struct VersionData {
    major: Option<u32>,
    semver: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BinaryMetadata {
    architecture: Option<String>,
    image_type: Option<String>,
    jvm_impl: Option<String>,
    os: Option<String>,
    project: Option<String>,
    package: Option<PackageMetadata>,
}

#[derive(Debug, Deserialize)]
struct PackageMetadata {
    name: Option<String>,
    link: Option<String>,
    checksum: Option<String>,
    size: Option<u64>,
}

pub fn metadata_url(target: JavaTarget) -> String {
    format!(
        "https://api.adoptium.net/v3/assets/feature_releases/{JAVA_MAJOR_VERSION}/ga?architecture={}&image_type=jre&jvm_impl=hotspot&os={}&page_size=1&project=jdk&vendor=eclipse",
        target.arch.adoptium_name(),
        target.os.adoptium_name()
    )
}

/// Parses one Adoptium API response and accepts only the requested Temurin JRE.
pub fn parse_metadata(raw: &str, target: JavaTarget) -> Result<TemurinRelease, String> {
    if raw.len() > MAX_METADATA_BYTES {
        return Err("Temurin metadata response exceeds the size limit".to_owned());
    }
    let releases: Vec<ReleaseMetadata> =
        serde_json::from_str(raw).map_err(|_| "Temurin metadata is not valid JSON".to_owned())?;
    let release = releases
        .into_iter()
        .find(|release| {
            release.vendor.as_deref() == Some("eclipse")
                && release.version_data.as_ref().and_then(|v| v.major) == Some(21)
        })
        .ok_or_else(|| "Temurin metadata has no matching Java 21 release".to_owned())?;
    let version = release
        .version_data
        .and_then(|value| value.semver)
        .filter(|value| valid_java_21_version(value))
        .ok_or_else(|| "Temurin metadata has an invalid Java version".to_owned())?;
    let binary = release
        .binaries
        .unwrap_or_default()
        .into_iter()
        .find(|binary| {
            binary.architecture.as_deref() == Some(target.arch.adoptium_name())
                && binary.image_type.as_deref() == Some("jre")
                && binary.jvm_impl.as_deref() == Some("hotspot")
                && binary.os.as_deref() == Some(target.os.adoptium_name())
                && binary.project.as_deref().or(release.project.as_deref()) == Some("jdk")
        })
        .ok_or_else(|| "Temurin metadata has no matching JRE binary".to_owned())?;
    let package = binary
        .package
        .ok_or_else(|| "Temurin metadata is missing the JRE package".to_owned())?;
    let package_name = package
        .name
        .ok_or_else(|| "Temurin metadata is missing the package filename".to_owned())?;
    validate_package_name(&package_name, target)?;
    let archive = ArchiveKind::from_filename(&package_name)
        .ok_or_else(|| "Temurin package format is unsupported".to_owned())?;
    let url = package
        .link
        .ok_or_else(|| "Temurin metadata is missing the package URL".to_owned())?;
    validate_package_url(&url, &package_name)?;
    let sha256 = package
        .checksum
        .filter(|value| valid_hex(value, 64))
        .ok_or_else(|| "Temurin metadata has an invalid package SHA-256".to_owned())?
        .to_ascii_lowercase();
    let size = package
        .size
        .filter(|size| *size > 0 && *size <= archive::MAX_ARCHIVE_BYTES)
        .ok_or_else(|| "Temurin package size is missing or exceeds the limit".to_owned())?;

    if archive != ArchiveKind::expected_for(target.os) {
        return Err("Temurin package format does not match its platform".to_owned());
    }

    Ok(TemurinRelease {
        target,
        version,
        package_name,
        url,
        sha256,
        size,
        archive,
    })
}

/// Fetches bounded JSON only from the fixed Adoptium metadata endpoint.
pub async fn fetch_latest_release(target: JavaTarget) -> Result<TemurinRelease, String> {
    fetch_latest_release_cancelable(target, &CancellationToken::default()).await
}

/// Fetches Adoptium metadata with bounded retries and cancellation for launch flows.
pub(crate) async fn fetch_latest_release_cancelable(
    target: JavaTarget,
    cancellation: &CancellationToken,
) -> Result<TemurinRelease, String> {
    retry_transient(cancellation, || fetch_latest_release_once(target)).await
}

async fn fetch_latest_release_once(target: JavaTarget) -> Result<TemurinRelease, RetryFailure> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(METADATA_CONNECT_TIMEOUT)
        .timeout(METADATA_TIMEOUT)
        .https_only(true)
        .user_agent("NatuxWorldLauncher")
        .build()
        .map_err(|_| RetryFailure::permanent("cannot initialize Temurin metadata client"))?;
    let mut response = client
        .get(metadata_url(target))
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| RetryFailure::transient("Temurin metadata request failed"))?;
    if !response.status().is_success() {
        return Err(status_failure(response.status().as_u16()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_METADATA_BYTES as u64)
    {
        return Err(RetryFailure::permanent(
            "Temurin metadata response exceeds the size limit",
        ));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| RetryFailure::transient("failed to read Temurin metadata"))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_METADATA_BYTES {
            return Err(RetryFailure::permanent(
                "Temurin metadata response exceeds the size limit",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let text = std::str::from_utf8(&body)
        .map_err(|_| RetryFailure::permanent("Temurin metadata is not UTF-8"))?;
    parse_metadata(text, target).map_err(RetryFailure::permanent)
}

fn status_failure(status: u16) -> RetryFailure {
    let message = format!("Temurin metadata server returned HTTP {status}");
    if is_transient_http_status(status) {
        RetryFailure::transient(message)
    } else {
        RetryFailure::permanent(message)
    }
}

fn valid_java_21_version(value: &str) -> bool {
    value.starts_with("21.")
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'+' | b'-'))
}

fn valid_hex(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_package_name(name: &str, target: JavaTarget) -> Result<(), String> {
    let prefix = format!(
        "OpenJDK21U-jre_{}_{}_hotspot_",
        target.arch.adoptium_name(),
        target.os.adoptium_name()
    );
    let expected_suffix = match ArchiveKind::expected_for(target.os) {
        ArchiveKind::Zip => ".zip",
        ArchiveKind::TarGz => ".tar.gz",
    };
    if name.len() > 200
        || !name.starts_with(&prefix)
        || !name.ends_with(expected_suffix)
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-'))
    {
        return Err("Temurin metadata has an unsafe or mismatched package filename".to_owned());
    }
    Ok(())
}

fn validate_package_url(raw: &str, package_name: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Temurin package URL is invalid".to_owned())?;
    let segments = url
        .path_segments()
        .ok_or_else(|| "Temurin package URL has no path".to_owned())?
        .collect::<Vec<_>>();
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
        || url.query().is_some()
        || url.fragment().is_some()
        || segments.len() != 6
        || segments[..4] != ["adoptium", "temurin21-binaries", "releases", "download"]
        || !valid_release_tag(segments[4])
        || segments[5] != package_name
    {
        return Err("Temurin package URL is not an approved GitHub release URL".to_owned());
    }
    Ok(())
}

fn valid_release_tag(tag: &str) -> bool {
    let Some(suffix) = tag.strip_prefix("jdk-21.") else {
        return false;
    };
    if suffix.is_empty() || suffix.len() > 64 {
        return false;
    }
    let bytes = suffix.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index].is_ascii_alphanumeric() || matches!(bytes[index], b'.' | b'-' | b'+') {
            index += 1;
            continue;
        }
        if bytes[index] == b'%'
            && bytes.get(index + 1).is_some_and(|byte| *byte == b'2')
            && bytes
                .get(index + 2)
                .is_some_and(|byte| matches!(byte.to_ascii_uppercase(), b'B'))
        {
            index += 3;
            continue;
        }
        return false;
    }
    true
}
