use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use tar::{Archive as TarArchive, EntryType};
use zip::ZipArchive;

use crate::cancellation::CancellationToken;

use super::preflight::preflight_tar_gz;
use super::{
    ensure_directory_path, ensure_executable, find_runtime_root, io_message, prepare_file_path,
    reject_existing_runtime, reject_non_directory_or_symlink, reserve_size, resolve_symlink_target,
    safe_archive_path, set_safe_file_mode, ArchiveKind, Limits, DEFAULT_LIMITS, MAX_ARCHIVE_BYTES,
};

const COPY_BUFFER_BYTES: usize = 64 * 1024;

struct StagingDirectory(PathBuf);

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[cfg(test)]
pub(in crate::java) fn install_archive<F>(
    archive_path: &Path,
    runtime_dir: &Path,
    kind: ArchiveKind,
    executable_relative: &str,
    validate_runtime: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let mut never_cancel = || false;
    install_archive_with_cancel_check(
        archive_path,
        runtime_dir,
        kind,
        executable_relative,
        &mut never_cancel,
        validate_runtime,
    )
}

pub(in crate::java) fn install_archive_cancelable<F>(
    archive_path: &Path,
    runtime_dir: &Path,
    kind: ArchiveKind,
    executable_relative: &str,
    cancellation: &CancellationToken,
    validate_runtime: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let mut is_cancelled = || cancellation.is_cancelled();
    install_archive_with_cancel_check(
        archive_path,
        runtime_dir,
        kind,
        executable_relative,
        &mut is_cancelled,
        validate_runtime,
    )
}

fn install_archive_with_cancel_check<F>(
    archive_path: &Path,
    runtime_dir: &Path,
    kind: ArchiveKind,
    executable_relative: &str,
    is_cancelled: &mut dyn FnMut() -> bool,
    validate_runtime: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    check_cancelled(is_cancelled)?;
    verify_archive_file(archive_path)?;
    fs::create_dir_all(runtime_dir).map_err(io_message)?;
    reject_non_directory_or_symlink(runtime_dir)?;
    let runtime_dir = fs::canonicalize(runtime_dir).map_err(io_message)?;
    let target = runtime_dir.join("jre-21");
    reject_existing_runtime(&target)?;

    let staging_path = create_staging_directory(&runtime_dir)?;
    let staging = StagingDirectory(staging_path.clone());
    let payload = staging_path.join("payload");
    fs::create_dir(&payload).map_err(io_message)?;
    match kind {
        ArchiveKind::Zip => {
            extract_zip_cancelable(archive_path, &payload, DEFAULT_LIMITS, is_cancelled)?
        }
        ArchiveKind::TarGz => {
            extract_tar_gz_cancelable(archive_path, &payload, DEFAULT_LIMITS, is_cancelled)?
        }
    }
    check_cancelled(is_cancelled)?;
    let candidate = find_runtime_root(&payload, executable_relative)?;
    ensure_executable(&candidate, executable_relative)?;
    check_cancelled(is_cancelled)?;
    validate_runtime(&candidate)?;
    check_cancelled(is_cancelled)?;
    commit_runtime(&candidate, &target, &runtime_dir)?;
    drop(staging);
    Ok(())
}

#[cfg(test)]
pub(in crate::java) fn extract_zip(
    path: &Path,
    destination: &Path,
    limits: Limits,
) -> Result<(), String> {
    let mut never_cancel = || false;
    extract_zip_cancelable(path, destination, limits, &mut never_cancel)
}

fn extract_zip_cancelable(
    path: &Path,
    destination: &Path,
    limits: Limits,
    is_cancelled: &mut dyn FnMut() -> bool,
) -> Result<(), String> {
    check_cancelled(is_cancelled)?;
    let file = File::open(path).map_err(io_message)?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("invalid Java ZIP: {error}"))?;
    if archive.len() > limits.entries {
        return Err("Java ZIP contains too many entries".to_owned());
    }
    let mut expanded = 0_u64;
    for index in 0..archive.len() {
        check_cancelled(is_cancelled)?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("cannot read Java ZIP entry: {error}"))?;
        let name = entry.name().to_owned();
        let relative = safe_archive_path(&name, false)?;
        if entry.enclosed_name().is_none() {
            return Err(format!("unsafe Java ZIP entry: {name}"));
        }
        let directory = entry.is_dir() || name.ends_with('/');
        let mode = entry
            .unix_mode()
            .unwrap_or(if directory { 0o040755 } else { 0o100644 });
        let file_type = mode & 0o170000;
        if file_type == 0o120000
            || (file_type != 0 && file_type != 0o100000 && file_type != 0o040000)
        {
            return Err(format!(
                "Java ZIP contains an unsupported entry type: {name}"
            ));
        }
        if directory {
            ensure_directory_path(destination, &relative)?;
            continue;
        }
        if !entry.is_file() {
            return Err(format!("Java ZIP contains a non-regular entry: {name}"));
        }
        let size = entry.size();
        reserve_size(size, &mut expanded, limits)?;
        let target = prepare_file_path(destination, &relative)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(io_message)?;
        copy_exact_cancelable(
            &mut entry,
            &mut output,
            size,
            is_cancelled,
            &format!("truncated Java ZIP entry: {name}"),
        )?;
        check_cancelled(is_cancelled)?;
        let mut extra = [0_u8; 1];
        if entry.read(&mut extra).map_err(io_message)? != 0 {
            return Err(format!("Java ZIP entry exceeds its declared size: {name}"));
        }
        output.flush().map_err(io_message)?;
        output.sync_all().map_err(io_message)?;
        set_safe_file_mode(&target, mode)?;
    }
    Ok(())
}

#[cfg(test)]
pub(in crate::java) fn extract_tar_gz(
    path: &Path,
    destination: &Path,
    limits: Limits,
) -> Result<(), String> {
    let mut never_cancel = || false;
    extract_tar_gz_cancelable(path, destination, limits, &mut never_cancel)
}

fn extract_tar_gz_cancelable(
    path: &Path,
    destination: &Path,
    limits: Limits,
    is_cancelled: &mut dyn FnMut() -> bool,
) -> Result<(), String> {
    preflight_tar_gz(path, limits, is_cancelled)?;
    check_cancelled(is_cancelled)?;
    let file = File::open(path).map_err(io_message)?;
    let decoder = GzDecoder::new(file);
    let mut archive = TarArchive::new(decoder);
    archive.set_overwrite(false);
    archive.set_preserve_permissions(false);
    archive.set_preserve_ownerships(false);
    archive.set_unpack_xattrs(false);
    archive.set_preserve_mtime(false);
    let mut seen = HashSet::new();
    let mut symlinks = HashSet::new();
    let mut regular_files = HashSet::new();
    let mut expanded = 0_u64;
    let entries = archive.entries().map_err(io_message)?;
    for entry in entries {
        check_cancelled(is_cancelled)?;
        let mut entry = entry.map_err(io_message)?;
        let raw_path = entry
            .path()
            .map_err(io_message)?
            .to_str()
            .ok_or_else(|| "Java TAR path is not valid UTF-8".to_owned())?
            .to_owned();
        let relative = safe_archive_path(&raw_path, true)?;
        if symlinks
            .iter()
            .any(|link: &PathBuf| relative.starts_with(link) && relative != *link)
        {
            return Err("Java TAR entry is nested below an earlier symlink".to_owned());
        }
        let kind = entry.header().entry_type();
        if kind == EntryType::Directory {
            if seen.contains(&relative) {
                ensure_directory_path(destination, &relative)?;
                continue;
            }
            if !entry.unpack_in(destination).map_err(io_message)? {
                return Err("Java TAR directory path was rejected".to_owned());
            }
            seen.insert(relative);
            continue;
        }
        if !seen.insert(relative.clone()) {
            return Err("Java TAR contains duplicate archive paths".to_owned());
        }
        if kind.is_file() || kind.is_contiguous() {
            let size = entry.size();
            reserve_size(size, &mut expanded, limits)?;
            let mode = entry.header().mode().map_err(io_message)?;
            let target = prepare_file_path(destination, &relative)?;
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(io_message)?;
            copy_exact_cancelable(
                &mut entry,
                &mut output,
                size,
                is_cancelled,
                "truncated Java TAR entry",
            )?;
            output.flush().map_err(io_message)?;
            output.sync_all().map_err(io_message)?;
            set_safe_file_mode(&target, mode)?;
            regular_files.insert(relative);
            continue;
        }
        if kind.is_symlink() {
            let target = entry
                .link_name()
                .map_err(io_message)?
                .ok_or_else(|| "Java TAR symlink has no target".to_owned())?;
            resolve_symlink_target(&relative, &target)?;
            if !entry.unpack_in(destination).map_err(io_message)? {
                return Err("Java TAR symlink path was rejected".to_owned());
            }
            symlinks.insert(relative);
            continue;
        }
        if kind.is_hard_link() {
            let target = entry
                .link_name()
                .map_err(io_message)?
                .ok_or_else(|| "Java TAR hard link has no target".to_owned())?;
            let target = safe_archive_path(
                target
                    .to_str()
                    .ok_or_else(|| "Java TAR hard-link path is not valid UTF-8".to_owned())?,
                false,
            )?;
            if !regular_files.contains(&target) {
                return Err("Java TAR hard link must target an earlier regular file".to_owned());
            }
            if !entry.unpack_in(destination).map_err(io_message)? {
                return Err("Java TAR hard-link path was rejected".to_owned());
            }
            regular_files.insert(relative);
            continue;
        }
        return Err("Java TAR contains an unsupported special file".to_owned());
    }
    Ok(())
}

fn copy_exact_cancelable(
    input: &mut impl Read,
    output: &mut impl Write,
    mut remaining: u64,
    is_cancelled: &mut dyn FnMut() -> bool,
    truncated_message: &str,
) -> Result<(), String> {
    let mut buffer = [0_u8; COPY_BUFFER_BYTES];
    while remaining > 0 {
        check_cancelled(is_cancelled)?;
        let amount = usize::try_from(remaining.min(buffer.len() as u64))
            .map_err(|_| "Java archive size conversion failed".to_owned())?;
        let count = input.read(&mut buffer[..amount]).map_err(io_message)?;
        if count == 0 {
            return Err(truncated_message.to_owned());
        }
        output.write_all(&buffer[..count]).map_err(io_message)?;
        remaining -= count as u64;
    }
    Ok(())
}

fn check_cancelled(is_cancelled: &mut dyn FnMut() -> bool) -> Result<(), String> {
    if is_cancelled() {
        Err("Отменено".to_owned())
    } else {
        Ok(())
    }
}

fn verify_archive_file(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(io_message)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Java archive must be a regular file".to_owned());
    }
    if metadata.len() == 0 || metadata.len() > MAX_ARCHIVE_BYTES {
        return Err("Java archive is empty or exceeds the size limit".to_owned());
    }
    Ok(())
}

fn create_staging_directory(runtime_dir: &Path) -> Result<PathBuf, String> {
    for _ in 0..3 {
        let candidate = runtime_dir.join(format!(".jre-21-stage-{}", uuid::Uuid::new_v4()));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(io_message(error)),
        }
    }
    Err("could not allocate Java staging directory".to_owned())
}

fn commit_runtime(candidate: &Path, target: &Path, runtime_dir: &Path) -> Result<(), String> {
    let backup = runtime_dir.join(format!(".jre-21-backup-{}", uuid::Uuid::new_v4()));
    let had_previous = target.exists();
    if had_previous {
        reject_existing_runtime(target)?;
        fs::rename(target, &backup).map_err(io_message)?;
    }
    if let Err(error) = fs::rename(candidate, target) {
        if had_previous && fs::rename(&backup, target).is_err() {
            return Err(
                "Java runtime install failed and rollback could not restore the old runtime"
                    .to_owned(),
            );
        }
        return Err(io_message(error));
    }
    if had_previous {
        let _ = fs::remove_dir_all(backup);
    }
    Ok(())
}
