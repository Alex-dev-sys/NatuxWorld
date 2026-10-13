use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::AppHandle;

use crate::cancellation::CancellationToken;
use crate::downloads::{DownloadJob, DownloadService};
use crate::metadata::{merge_inherited, VersionMetadata};

use super::arguments::console_java_path;
use super::process::run_installer;
use super::LaunchProgress;

const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";
const MAX_FORGE_METADATA_BYTES: u64 = 8 * 1024 * 1024;

const FORGE_BUILDS: &[(&str, &str, &str)] = &[
    (
        "1.21.6",
        "56.0.4",
        "b87bfa6df88093031f9b3f7b20dc66da41bb2f9b",
    ),
    (
        "1.21.1",
        "52.1.14",
        "88d7fe47509013e3abe4879553b1395207141420",
    ),
    (
        "1.20.1",
        "47.4.20",
        "237c5a17d941bfe793ff5780a4f330914d2c9f57",
    ),
];

#[allow(clippy::too_many_arguments)]
pub(crate) async fn install(
    app: &AppHandle,
    minecraft_version: &str,
    java_path: &Path,
    vanilla: &VersionMetadata,
    root: &Path,
    downloads: &DownloadService,
    cancellation: &CancellationToken,
    progress: Arc<dyn Fn(LaunchProgress) + Send + Sync>,
) -> Result<VersionMetadata, String> {
    let (build, sha1) = FORGE_BUILDS
        .iter()
        .find(|(version, _, _)| *version == minecraft_version)
        .map(|(_, build, hash)| (*build, *hash))
        .ok_or_else(|| format!("Forge is not supported for Minecraft {minecraft_version}"))?;
    let version_id = format!("{minecraft_version}-forge-{build}");
    let installer_name = format!("forge-{minecraft_version}-{build}-installer.jar");
    let installer_relative = PathBuf::from("forge")
        .join(minecraft_version)
        .join(&installer_name);
    let installer_path = root.join(&installer_relative);
    let version_json = root
        .join("versions")
        .join(&version_id)
        .join(format!("{version_id}.json"));
    let client_jar = root
        .join("libraries/net/minecraftforge/forge")
        .join(format!("{minecraft_version}-{build}"))
        .join(format!("forge-{minecraft_version}-{build}-client.jar"));

    if let Some(cached) =
        cached_forge_version(&version_json, &client_jar, minecraft_version, &version_id)?
    {
        progress(LaunchProgress::new(
            "forge-install",
            95,
            "Forge уже установлен",
        ));
        return merge_inherited(vanilla, cached);
    }
    remove_stale_forge_cache(&version_json, &client_jar)?;
    progress(LaunchProgress::new(
        "forge-install",
        0,
        "Загрузка установщика Forge...",
    ));
    let job = DownloadJob {
        url: format!("{FORGE_MAVEN}/{minecraft_version}-{build}/{installer_name}"),
        destination: installer_relative,
        expected_sha1: Some(sha1.to_owned()),
        expected_sha256: None,
        expected_size: None,
    };
    let progress_for_download = Arc::clone(&progress);
    let cancel_for_download = cancellation.clone();
    downloads
        .download_many_cancelable(vec![job], cancel_for_download, move |done, total, path| {
            let percent = done.saturating_mul(25).checked_div(total).unwrap_or(0) as u8;
            progress_for_download(
                LaunchProgress::new(
                    "forge-install",
                    5 + percent.min(25),
                    "Загрузка установщика Forge...",
                )
                .with_detail(
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("installer.jar"),
                ),
            );
        })
        .await
        .map_err(|error| error.to_string())?;
    if cancellation.is_cancelled() {
        return Err("Отменено".to_owned());
    }

    ensure_regular_file_or_create(&root.join("launcher_profiles.json"))?;
    fs::create_dir_all(version_json.parent().expect("version JSON parent")).map_err(io_message)?;
    progress(LaunchProgress::new(
        "forge-install",
        35,
        "Установка Forge (процессоры)...",
    ));
    run_installer(
        app,
        &console_java_path(java_path),
        root,
        &installer_path,
        cancellation,
    )
    .await?;
    if cancellation.is_cancelled() {
        return Err("Отменено".to_owned());
    }
    let forge =
        match cached_forge_version(&version_json, &client_jar, minecraft_version, &version_id)? {
            Some(forge) => forge,
            None => {
                remove_stale_forge_cache(&version_json, &client_jar)?;
                return Err(
                    "Forge installer did not create a valid profile and patched client JAR"
                        .to_owned(),
                );
            }
        };
    progress(LaunchProgress::new("forge-install", 100, "Forge готов"));
    merge_inherited(vanilla, forge)
}

fn cached_forge_version(
    version_json: &Path,
    client_jar: &Path,
    minecraft_version: &str,
    expected_id: &str,
) -> Result<Option<VersionMetadata>, String> {
    let version_metadata = match fs::symlink_metadata(version_json) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_message(error)),
    };
    if version_metadata.file_type().is_symlink() || !version_metadata.is_file() {
        return Err("Forge version metadata path is unsafe".to_owned());
    }
    if version_metadata.len() == 0 || version_metadata.len() > MAX_FORGE_METADATA_BYTES {
        return Ok(None);
    }
    let client_metadata = match fs::symlink_metadata(client_jar) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_message(error)),
    };
    if client_metadata.file_type().is_symlink() || !client_metadata.is_file() {
        return Err("Forge patched client JAR path is unsafe".to_owned());
    }
    if !contains_minecraft_client_class(client_jar)? {
        return Ok(None);
    }
    let bytes = match fs::read(version_json) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_message(error)),
    };
    let Ok(text) = std::str::from_utf8(&bytes) else {
        return Ok(None);
    };
    let Ok(forge) = crate::metadata::parse_version_metadata(text) else {
        return Ok(None);
    };
    if forge.id != expected_id || forge.inherits_from.as_deref() != Some(minecraft_version) {
        return Ok(None);
    }
    Ok(Some(forge))
}

fn contains_minecraft_client_class(path: &Path) -> Result<bool, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(io_message(error)),
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(archive) => archive,
        Err(error) => return classify_cached_jar_error(error),
    };
    let result = match archive.by_name("net/minecraft/client/Minecraft.class") {
        Ok(_) => Ok(true),
        Err(error) => classify_cached_jar_error(error),
    };
    result
}

fn classify_cached_jar_error(error: zip::result::ZipError) -> Result<bool, String> {
    match error {
        zip::result::ZipError::Io(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound
                    | std::io::ErrorKind::UnexpectedEof
                    | std::io::ErrorKind::InvalidData
            ) =>
        {
            Ok(false)
        }
        zip::result::ZipError::Io(error) => Err(io_message(error)),
        zip::result::ZipError::InvalidArchive(_)
        | zip::result::ZipError::UnsupportedArchive(_)
        | zip::result::ZipError::FileNotFound
        | zip::result::ZipError::InvalidPassword
        | zip::result::ZipError::CompressionMethodNotSupported(_) => Ok(false),
        _ => Ok(false),
    }
}

fn remove_stale_json(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err("Forge version metadata path is unsafe".to_owned())
        }
        Ok(_) => fs::remove_file(path).map_err(io_message),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_message(error)),
    }
}

fn remove_stale_forge_cache(version_json: &Path, client_jar: &Path) -> Result<(), String> {
    remove_stale_json(version_json)?;
    remove_stale_client_jar(client_jar)
}

fn remove_stale_client_jar(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err("Forge patched client JAR path is unsafe".to_owned())
        }
        Ok(_) => fs::remove_file(path).map_err(io_message),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_message(error)),
    }
}

fn ensure_regular_file_or_create(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err("Forge launcher profile path is unsafe".to_owned())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
                .map_err(io_message)?;
            file.write_all(br#"{"profiles":{},"version":3}"#)
                .map_err(io_message)
        }
        Err(error) => Err(io_message(error)),
    }
}

fn io_message(error: std::io::Error) -> String {
    format!("Forge installation failed: {error}")
}

#[cfg(test)]
#[path = "forge/tests.rs"]
mod tests;
