use std::fs;
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

use atomicwrites::{AllowOverwrite, AtomicFile};
use sha1::{Digest, Sha1};
use tokio::time::Duration;

use crate::cancellation::CancellationToken;
use crate::metadata::{
    find_version, parse_asset_index, parse_version_manifest, parse_version_metadata, AssetIndex,
    VersionMetadata, VERSION_MANIFEST_URL,
};

use super::retry::{is_transient_http_status, retry_transient, RetryFailure};

const MAX_METADATA_BYTES: usize = 16 * 1024 * 1024;
const MAX_ASSET_INDEX_BYTES: u64 = 32 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) async fn resolve_version(
    minecraft_root: &Path,
    version_id: &str,
    cancellation: &CancellationToken,
) -> Result<VersionMetadata, String> {
    crate::metadata::validate_version_id(version_id)?;
    if let Some(version) = load_cached_version(minecraft_root, version_id)? {
        return Ok(version);
    }

    let manifest_bytes = fetch_bounded(VERSION_MANIFEST_URL, None, cancellation).await?;
    let manifest_text = std::str::from_utf8(&manifest_bytes)
        .map_err(|_| "Mojang version manifest is not UTF-8".to_owned())?;
    let manifest = parse_version_manifest(manifest_text)?;
    let entry = find_version(&manifest, version_id)
        .ok_or_else(|| format!("Minecraft version {version_id} is not in the Mojang manifest"))?;
    let version_url = entry.url.clone();
    let expected_sha1 = entry.sha1.clone();
    let bytes = fetch_bounded(&version_url, Some(&expected_sha1), cancellation).await?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| "Minecraft version metadata is not UTF-8".to_owned())?;
    let version = parse_version_metadata(text)?;
    if version.id != version_id {
        return Err("Minecraft version metadata id does not match the manifest".to_owned());
    }
    write_version_cache(minecraft_root, version_id, &bytes)?;
    Ok(version)
}

fn version_cache_path(minecraft_root: &Path, version_id: &str) -> Result<PathBuf, String> {
    crate::metadata::validate_version_id(version_id)?;
    Ok(minecraft_root
        .join("versions")
        .join(version_id)
        .join(format!("{version_id}.json")))
}

fn load_cached_version(
    minecraft_root: &Path,
    version_id: &str,
) -> Result<Option<VersionMetadata>, String> {
    let root = fs::canonicalize(minecraft_root)
        .map_err(|error| format!("cannot resolve Minecraft directory: {error}"))?;
    let path = version_cache_path(&root, version_id)?;
    let Some(path) = validate_cache_target(&root, &path, false)? else {
        return Ok(None);
    };
    let file = match fs::File::open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("cannot read cached Minecraft metadata: {error}")),
    };
    let mut bytes = Vec::new();
    file.take((MAX_METADATA_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("cannot read cached Minecraft metadata: {error}"))?;

    if bytes.len() > MAX_METADATA_BYTES {
        let _ = fs::remove_file(&path);
        return Ok(None);
    }

    let parsed = std::str::from_utf8(&bytes)
        .map_err(|_| "cached Minecraft metadata is not UTF-8".to_owned())
        .and_then(crate::metadata::parse_version_metadata);
    match parsed {
        Ok(version) if version.id == version_id => Ok(Some(version)),
        Ok(_) | Err(_) => {
            let _ = fs::remove_file(&path);
            Ok(None)
        }
    }
}

fn write_version_cache(
    minecraft_root: &Path,
    version_id: &str,
    bytes: &[u8],
) -> Result<(), String> {
    if bytes.len() > MAX_METADATA_BYTES {
        return Err("Minecraft metadata exceeds the size limit".to_owned());
    }
    let root = fs::canonicalize(minecraft_root)
        .map_err(|error| format!("cannot resolve Minecraft directory: {error}"))?;
    let path = version_cache_path(&root, version_id)?;
    let path = validate_cache_target(&root, &path, true)?
        .ok_or_else(|| "Minecraft metadata cache path is unavailable".to_owned())?;
    AtomicFile::new(&path, AllowOverwrite)
        .write(|file| std::io::Write::write_all(file, bytes))
        .map_err(|error| format!("cannot write Minecraft metadata cache: {error}"))
}

fn validate_cache_target(
    root: &Path,
    target: &Path,
    create_parents: bool,
) -> Result<Option<PathBuf>, String> {
    let relative = target
        .strip_prefix(root)
        .map_err(|_| "Minecraft metadata cache escaped its root".to_owned())?;
    let components = relative.components().collect::<Vec<_>>();
    if components.len() < 2 {
        return Err("Minecraft metadata cache path is invalid".to_owned());
    }

    let mut current = root.to_path_buf();
    for component in components.iter().take(components.len() - 1) {
        let Component::Normal(name) = component else {
            return Err("Minecraft metadata cache path is invalid".to_owned());
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err("Minecraft metadata cache contains an unsafe directory".to_owned());
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound && !create_parents => {
                return Ok(None);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                match fs::create_dir(&current) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                    Err(error) => {
                        return Err(format!("cannot create Minecraft metadata cache: {error}"));
                    }
                }
                let metadata = fs::symlink_metadata(&current).map_err(|error| {
                    format!("cannot inspect Minecraft metadata cache directory: {error}")
                })?;
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err("Minecraft metadata cache contains an unsafe directory".to_owned());
                }
            }
            Err(error) => {
                return Err(format!("cannot inspect Minecraft metadata cache: {error}"));
            }
        }
        let canonical = fs::canonicalize(&current)
            .map_err(|error| format!("cannot resolve Minecraft metadata cache: {error}"))?;
        if !canonical.starts_with(root) {
            return Err("Minecraft metadata cache escaped its root".to_owned());
        }
    }

    match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err("Minecraft metadata cache file is not a regular file".to_owned())
        }
        Ok(_) => {
            let canonical = fs::canonicalize(target).map_err(|error| {
                format!("cannot resolve Minecraft metadata cache file: {error}")
            })?;
            if canonical.starts_with(root) {
                Ok(Some(target.to_path_buf()))
            } else {
                Err("Minecraft metadata cache escaped its root".to_owned())
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound && !create_parents => Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Some(target.to_path_buf())),
        Err(error) => Err(format!(
            "cannot inspect Minecraft metadata cache file: {error}"
        )),
    }
}

pub(crate) fn parse_asset_index_file(bytes: &[u8]) -> Result<AssetIndex, String> {
    if bytes.len() > MAX_ASSET_INDEX_BYTES as usize {
        return Err("Minecraft asset index exceeds the size limit".to_owned());
    }
    let text =
        std::str::from_utf8(bytes).map_err(|_| "Minecraft asset index is not UTF-8".to_owned())?;
    parse_asset_index(text)
}

pub(crate) const fn max_asset_index_bytes() -> u64 {
    MAX_ASSET_INDEX_BYTES
}

async fn fetch_bounded(
    raw_url: &str,
    expected_sha1: Option<&str>,
    cancellation: &CancellationToken,
) -> Result<Vec<u8>, String> {
    let raw_url = raw_url.to_owned();
    let expected_sha1 = expected_sha1.map(str::to_owned);
    retry_transient(cancellation, || {
        let cancellation = cancellation.clone();
        let raw_url = raw_url.clone();
        let expected_sha1 = expected_sha1.clone();
        async move { fetch_bounded_once(&raw_url, expected_sha1.as_deref(), &cancellation).await }
    })
    .await
}

async fn fetch_bounded_once(
    raw_url: &str,
    expected_sha1: Option<&str>,
    cancellation: &CancellationToken,
) -> Result<Vec<u8>, RetryFailure> {
    validate_metadata_url(raw_url).map_err(RetryFailure::permanent)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .https_only(true)
        .user_agent("NatuxWorldLauncher")
        .build()
        .map_err(|_| RetryFailure::permanent("cannot initialize Mojang metadata client"))?;
    let mut response = tokio::select! {
        _ = cancellation.cancelled() => return Err(RetryFailure::permanent("Отменено")),
        result = client.get(raw_url).send() => {
            result.map_err(|_| RetryFailure::transient("Mojang metadata request failed"))?
        }
    };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let message = format!("Mojang metadata server returned HTTP {status}");
        return Err(if is_transient_http_status(status) {
            RetryFailure::transient(message)
        } else {
            RetryFailure::permanent(message)
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_METADATA_BYTES as u64)
    {
        return Err(RetryFailure::permanent(
            "Mojang metadata response exceeds the size limit",
        ));
    }

    let mut body = Vec::new();
    let mut digest = Sha1::new();
    while let Some(chunk) = tokio::select! {
        _ = cancellation.cancelled() => return Err(RetryFailure::permanent("Отменено")),
        result = response.chunk() => result.map_err(|_| RetryFailure::transient("failed to read Mojang metadata"))?,
    } {
        if body.len().saturating_add(chunk.len()) > MAX_METADATA_BYTES {
            return Err(RetryFailure::permanent(
                "Mojang metadata response exceeds the size limit",
            ));
        }
        digest.update(&chunk);
        body.extend_from_slice(&chunk);
    }
    if let Some(expected) = expected_sha1 {
        let actual = format!("{:x}", digest.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(RetryFailure::permanent(
                "Minecraft version metadata SHA-1 does not match the manifest",
            ));
        }
    }
    Ok(body)
}

fn validate_metadata_url(raw_url: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw_url).map_err(|_| "metadata URL is invalid".to_owned())?;
    let host = url.host_str().unwrap_or_default();
    let approved = matches!(
        host,
        "launchermeta.mojang.com" | "piston-meta.mojang.com" | "piston-data.mojang.com"
    );
    if url.scheme() != "https"
        || !approved
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("metadata URL is outside the approved Mojang HTTPS hosts".to_owned());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
