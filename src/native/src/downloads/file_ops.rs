use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read};
use std::net::IpAddr;
use std::path::{Component, Path, PathBuf};

use reqwest::Url;
use sha1::{Digest, Sha1};
use sha2::Sha256;

use super::{DownloadError, DownloadJob};

pub(super) fn normalize_allowed_hosts<I, S>(
    hosts: I,
    allow_loopback_http: bool,
) -> Result<HashSet<String>, DownloadError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut normalized = HashSet::new();
    for raw in hosts {
        let raw = raw.as_ref();
        if raw.is_empty()
            || raw.trim() != raw
            || raw.chars().any(|ch| matches!(ch, '*' | '/' | '@' | ':'))
        {
            return Err(DownloadError::InvalidPolicy);
        }
        let url =
            Url::parse(&format!("https://{raw}/")).map_err(|_| DownloadError::InvalidPolicy)?;
        let host = url.host_str().ok_or(DownloadError::InvalidPolicy)?;
        let is_ip = host.parse::<IpAddr>().is_ok();
        let is_loopback_ip = host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false);
        if (is_ip && !(allow_loopback_http && is_loopback_ip)) || host.ends_with('.') {
            return Err(DownloadError::InvalidPolicy);
        }
        normalized.insert(host.to_ascii_lowercase());
    }
    Ok(normalized)
}

pub(super) fn validate_relative_destination(path: &Path) -> Result<(), DownloadError> {
    if path.as_os_str().is_empty() || path.to_string_lossy().len() > 4096 {
        return Err(DownloadError::InvalidDestination);
    }
    let mut count = 0;
    for component in path.components() {
        let Component::Normal(name) = component else {
            return Err(DownloadError::InvalidDestination);
        };
        let name = name.to_string_lossy();
        if name.is_empty()
            || name.len() > 255
            || name.chars().any(|ch| matches!(ch, '\\' | ':' | '\0'))
            || name.ends_with('.')
            || name.ends_with(' ')
            || is_windows_device_name(&name)
        {
            return Err(DownloadError::InvalidDestination);
        }
        count += 1;
    }
    if count == 0 {
        return Err(DownloadError::InvalidDestination);
    }
    Ok(())
}

fn is_windows_device_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

pub(super) fn destination_key(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(path.to_string_lossy().to_ascii_lowercase())
    }
    #[cfg(not(windows))]
    {
        path.to_path_buf()
    }
}

pub(super) fn prepare_destination(root: &Path, relative: &Path) -> Result<PathBuf, DownloadError> {
    validate_relative_destination(relative)?;
    let mut current = root.to_path_buf();
    let components = relative.components().collect::<Vec<_>>();
    for component in components.iter().take(components.len().saturating_sub(1)) {
        let Component::Normal(name) = component else {
            return Err(DownloadError::InvalidDestination);
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(DownloadError::UnsafeDestination);
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                match fs::create_dir(&current) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                    Err(_) => return Err(DownloadError::Io),
                }
                let metadata = fs::symlink_metadata(&current).map_err(|_| DownloadError::Io)?;
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(DownloadError::UnsafeDestination);
                }
            }
            Err(_) => return Err(DownloadError::Io),
        }
        let canonical = fs::canonicalize(&current).map_err(|_| DownloadError::Io)?;
        if !canonical.starts_with(root) {
            return Err(DownloadError::UnsafeDestination);
        }
    }
    let target = root.join(relative);
    reject_unsafe_existing_target(root, &target)?;
    Ok(target)
}

pub(super) fn reject_unsafe_existing_target(
    root: &Path,
    target: &Path,
) -> Result<(), DownloadError> {
    match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(DownloadError::UnsafeDestination)
        }
        Ok(_) => {
            let canonical = fs::canonicalize(target).map_err(|_| DownloadError::Io)?;
            if canonical.starts_with(root) {
                Ok(())
            } else {
                Err(DownloadError::UnsafeDestination)
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(DownloadError::Io),
    }
}

pub(super) fn matching_cached_file(
    path: &Path,
    job: &DownloadJob,
) -> Result<Option<u64>, DownloadError> {
    if job.expected_sha1.is_none() && job.expected_sha256.is_none() {
        return Ok(None);
    }
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err(DownloadError::UnsafeDestination);
        }
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(DownloadError::Io),
    };
    if job.expected_size.is_some_and(|size| size != metadata.len()) {
        return Ok(None);
    }
    let mut file = File::open(path).map_err(|_| DownloadError::Io)?;
    let mut digest = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|_| DownloadError::Io)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
        sha256.update(&buffer[..count]);
    }
    let sha1_matches = job
        .expected_sha1
        .as_deref()
        .is_none_or(|expected| format!("{:x}", digest.finalize()) == expected);
    let sha256_matches = job
        .expected_sha256
        .as_deref()
        .is_none_or(|expected| format!("{:x}", sha256.finalize()) == expected);
    if sha1_matches && sha256_matches {
        Ok(Some(metadata.len()))
    } else {
        Ok(None)
    }
}
