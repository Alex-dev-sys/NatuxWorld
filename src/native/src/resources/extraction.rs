//! Cancellable native archive extraction with a staging-directory commit.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::cancellation::CancellationToken;
use crate::metadata::{Platform, VersionMetadata};

use super::{native_archive_path, select_native_libraries, validate_relative_path};

const MAX_NATIVE_ARCHIVE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_NATIVE_ENTRIES: usize = 50_000;
const MAX_NATIVE_EXPANDED_BYTES: u64 = 1024 * 1024 * 1024;
pub(super) const NATIVE_COPY_BUFFER_BYTES: usize = 64 * 1024;
const MAX_UNIQUE_PATH_ATTEMPTS: usize = 64;
static NEXT_STAGING_ID: AtomicU64 = AtomicU64::new(0);

pub(crate) struct NativeExtractionRequest {
    version: VersionMetadata,
    minecraft_root: PathBuf,
    native_dir: PathBuf,
    cancellation: CancellationToken,
}

impl NativeExtractionRequest {
    pub(crate) fn new(
        version: VersionMetadata,
        minecraft_root: PathBuf,
        native_dir: PathBuf,
        cancellation: CancellationToken,
    ) -> Self {
        Self {
            version,
            minecraft_root,
            native_dir,
            cancellation,
        }
    }
}

pub(crate) fn extract_natives_cancelable(request: NativeExtractionRequest) -> Result<(), String> {
    let NativeExtractionRequest {
        version,
        minecraft_root,
        native_dir,
        cancellation,
    } = request;
    extract_natives_with_observer(
        &version,
        &minecraft_root,
        &native_dir,
        &Platform::current(),
        &cancellation,
        |_| {},
    )
}

pub(super) fn extract_natives_with_observer<F>(
    version: &VersionMetadata,
    minecraft_root: &Path,
    native_dir: &Path,
    platform: &Platform,
    cancellation: &CancellationToken,
    mut after_chunk: F,
) -> Result<(), String>
where
    F: FnMut(usize),
{
    check_cancelled(cancellation)?;
    validate_native_directory(native_dir)?;
    let mut staging = StagingDirectory::create(native_dir)?;
    let root = fs::canonicalize(staging.path()).map_err(io_message)?;
    for library in select_native_libraries(&version.libraries, platform) {
        check_cancelled(cancellation)?;
        let Some(relative_path) = native_archive_path(library, platform) else {
            continue;
        };
        validate_relative_path(&relative_path)?;
        let archive = minecraft_root.join(relative_path);
        if !archive.is_file() {
            // Keep parity with the old launcher: an absent optional native archive
            // is skipped, leaving the game process to report a missing native if needed.
            continue;
        }
        extract_archive_with_observer(
            &archive,
            &root,
            MAX_NATIVE_ENTRIES,
            MAX_NATIVE_EXPANDED_BYTES,
            cancellation,
            &mut after_chunk,
        )?;
    }
    check_cancelled(cancellation)?;
    commit_staging(&mut staging, native_dir, cancellation)
}

#[cfg(test)]
pub(super) fn extract_archive(archive_path: &Path, root: &Path) -> Result<(), String> {
    extract_archive_with_limits(
        archive_path,
        root,
        MAX_NATIVE_ENTRIES,
        MAX_NATIVE_EXPANDED_BYTES,
    )
}

#[cfg(test)]
pub(super) fn extract_archive_with_limits(
    archive_path: &Path,
    root: &Path,
    max_entries: usize,
    max_expanded_bytes: u64,
) -> Result<(), String> {
    let cancellation = CancellationToken::default();
    let mut after_chunk = |_| {};
    extract_archive_with_observer(
        archive_path,
        root,
        max_entries,
        max_expanded_bytes,
        &cancellation,
        &mut after_chunk,
    )
}

fn extract_archive_with_observer<F>(
    archive_path: &Path,
    root: &Path,
    max_entries: usize,
    max_expanded_bytes: u64,
    cancellation: &CancellationToken,
    after_chunk: &mut F,
) -> Result<(), String>
where
    F: FnMut(usize),
{
    check_cancelled(cancellation)?;
    let metadata = fs::symlink_metadata(archive_path).map_err(io_message)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > MAX_NATIVE_ARCHIVE_BYTES
    {
        return Err(
            "native archive is not a safe regular file or exceeds the size limit".to_owned(),
        );
    }
    let file = File::open(archive_path).map_err(io_message)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("cannot open native archive: {error}"))?;
    if archive.len() > max_entries {
        return Err("native archive contains too many entries".to_owned());
    }
    let mut expanded_bytes = 0_u64;
    let mut buffer = [0_u8; NATIVE_COPY_BUFFER_BYTES];
    for index in 0..archive.len() {
        check_cancelled(cancellation)?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("cannot read native archive entry: {error}"))?;
        let name = entry.name().to_owned();
        let entry_path = entry
            .enclosed_name()
            .ok_or_else(|| format!("unsafe native archive entry: {name}"))?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!("native archive contains a symlink: {name}"));
        }
        expanded_bytes = expanded_bytes
            .checked_add(entry.size())
            .ok_or_else(|| "native archive expanded size overflow".to_owned())?;
        if expanded_bytes > max_expanded_bytes {
            return Err("native archive expanded data exceeds the size limit".to_owned());
        }
        if entry.is_dir() || should_skip_native_entry(&entry_path) {
            continue;
        }
        let file_name = entry_path
            .file_name()
            .ok_or_else(|| format!("unsafe native archive entry: {name}"))?;
        let target = root.join(file_name);
        reject_existing_symlink(&target)?;
        let mut output = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&target)
            .map_err(io_message)?;
        loop {
            check_cancelled(cancellation)?;
            let read = entry.read(&mut buffer).map_err(io_message)?;
            if read == 0 {
                break;
            }
            output.write_all(&buffer[..read]).map_err(io_message)?;
            after_chunk(read);
            check_cancelled(cancellation)?;
        }
        output.sync_all().map_err(io_message)?;
    }
    check_cancelled(cancellation)
}

fn validate_native_directory(native_dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(native_dir) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => Err(format!(
            "native output is not a regular directory: {}",
            native_dir.display()
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_message(error)),
    }
}

fn should_skip_native_entry(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();
    lower.starts_with("meta-inf/")
        || lower.ends_with(".class")
        || lower.ends_with(".git")
        || normalized.ends_with('/')
}

fn reject_existing_symlink(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => Err(format!(
            "native output is not a regular file: {}",
            path.display()
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_message(error)),
    }
}

struct StagingDirectory {
    path: PathBuf,
    active: bool,
}

impl StagingDirectory {
    fn create(native_dir: &Path) -> Result<Self, String> {
        let parent = native_dir
            .parent()
            .ok_or_else(|| "native output has no parent directory".to_owned())?;
        fs::create_dir_all(parent).map_err(io_message)?;
        for _ in 0..MAX_UNIQUE_PATH_ATTEMPTS {
            let path = unique_sibling_path(native_dir, "staging")?;
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self { path, active: true }),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(io_message(error)),
            }
        }
        Err("cannot allocate native staging directory".to_owned())
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn mark_moved(&mut self) {
        self.active = false;
    }
}

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        if self.active {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

fn commit_staging(
    staging: &mut StagingDirectory,
    native_dir: &Path,
    cancellation: &CancellationToken,
) -> Result<(), String> {
    check_cancelled(cancellation)?;
    validate_native_directory(native_dir)?;
    let backup = match fs::symlink_metadata(native_dir) {
        Ok(_) => {
            let path = unique_sibling_path(native_dir, "backup")?;
            fs::rename(native_dir, &path).map_err(io_message)?;
            Some(path)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(io_message(error)),
    };
    if cancellation.is_cancelled() {
        restore_backup(backup.as_deref(), native_dir)?;
        return Err("Отменено".to_owned());
    }
    if let Err(error) = fs::rename(staging.path(), native_dir) {
        let rollback = restore_backup(backup.as_deref(), native_dir);
        return match rollback {
            Ok(()) => Err(io_message(error)),
            Err(rollback_error) => Err(format!(
                "native extraction commit failed: {}; rollback failed: {rollback_error}",
                io_message(error)
            )),
        };
    }
    staging.mark_moved();
    if cancellation.is_cancelled() {
        rollback_committed(native_dir, backup.as_deref())?;
        return Err("Отменено".to_owned());
    }
    if let Some(backup) = backup {
        fs::remove_dir_all(backup).map_err(io_message)?;
    }
    Ok(())
}

fn restore_backup(backup: Option<&Path>, native_dir: &Path) -> Result<(), String> {
    if let Some(backup) = backup {
        fs::rename(backup, native_dir).map_err(io_message)?;
    }
    Ok(())
}

fn rollback_committed(native_dir: &Path, backup: Option<&Path>) -> Result<(), String> {
    fs::remove_dir_all(native_dir).map_err(io_message)?;
    restore_backup(backup, native_dir)
}

fn unique_sibling_path(native_dir: &Path, role: &str) -> Result<PathBuf, String> {
    let parent = native_dir
        .parent()
        .ok_or_else(|| "native output has no parent directory".to_owned())?;
    let name = native_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "native output name is invalid".to_owned())?;
    for _ in 0..MAX_UNIQUE_PATH_ATTEMPTS {
        let id = NEXT_STAGING_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{name}.{role}-{}-{id}", std::process::id()));
        match fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(candidate),
            Ok(_) => continue,
            Err(error) => return Err(io_message(error)),
        }
    }
    Err("cannot allocate a unique native directory path".to_owned())
}

fn check_cancelled(cancellation: &CancellationToken) -> Result<(), String> {
    if cancellation.is_cancelled() {
        Err("Отменено".to_owned())
    } else {
        Ok(())
    }
}

fn io_message(error: io::Error) -> String {
    format!("resource I/O failed: {error}")
}
