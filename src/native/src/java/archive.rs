use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use super::ArchiveKind;

mod installer;
mod preflight;

pub(super) use installer::install_archive_cancelable;
#[cfg(test)]
pub(super) use installer::{extract_tar_gz, extract_zip, install_archive};

pub(super) const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ENTRIES: usize = 100_000;
const MAX_EXPANDED_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;
const MAX_PATH_BYTES: usize = 4096;
const MAX_PATH_COMPONENTS: usize = 128;

#[derive(Clone, Copy)]
pub(super) struct Limits {
    pub(super) entries: usize,
    pub(super) expanded_bytes: u64,
}

const DEFAULT_LIMITS: Limits = Limits {
    entries: MAX_ENTRIES,
    expanded_bytes: MAX_EXPANDED_BYTES,
};

fn reserve_size(size: u64, total: &mut u64, limits: Limits) -> Result<(), String> {
    if size > MAX_ENTRY_BYTES {
        return Err("Java archive contains an oversized entry".to_owned());
    }
    *total = total
        .checked_add(size)
        .ok_or_else(|| "Java archive expanded size overflow".to_owned())?;
    if *total > limits.expanded_bytes {
        return Err("Java archive expanded data exceeds the size limit".to_owned());
    }
    Ok(())
}

fn safe_archive_path(raw: &str, allow_dot: bool) -> Result<PathBuf, String> {
    if raw.is_empty()
        || raw.len() > MAX_PATH_BYTES
        || raw.starts_with('/')
        || raw.contains(['\\', ':', '\0'])
    {
        return Err("Java archive contains an unsafe path".to_owned());
    }
    let mut output = PathBuf::new();
    let components = raw.split('/').collect::<Vec<_>>();
    for (index, component) in components.iter().enumerate() {
        if component.is_empty() && index + 1 == components.len() {
            continue;
        }
        if *component == "." && allow_dot {
            continue;
        }
        if component.is_empty()
            || *component == "."
            || *component == ".."
            || component.len() > 255
            || component.ends_with(['.', ' '])
            || is_windows_device_name(component)
        {
            return Err("Java archive contains a traversal or invalid path component".to_owned());
        }
        output.push(component);
    }
    if output.as_os_str().is_empty() || output.components().count() > MAX_PATH_COMPONENTS {
        return Err("Java archive path is empty or too deeply nested".to_owned());
    }
    if output
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Java archive path is not relative".to_owned());
    }
    Ok(output)
}

fn resolve_symlink_target(link_path: &Path, raw_target: &Path) -> Result<PathBuf, String> {
    let target = raw_target
        .to_str()
        .ok_or_else(|| "Java TAR symlink target is not valid UTF-8".to_owned())?;
    if target.is_empty()
        || target.len() > MAX_PATH_BYTES
        || target.starts_with('/')
        || target.contains(['\\', ':', '\0'])
    {
        return Err("Java TAR symlink target is invalid".to_owned());
    }
    let mut resolved = link_path
        .parent()
        .ok_or_else(|| "Java TAR symlink has no parent".to_owned())?
        .components()
        .filter_map(|component| match component {
            Component::Normal(name) => Some(name.to_os_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    for component in target.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                if resolved.pop().is_none() {
                    return Err("Java TAR symlink escapes the staging directory".to_owned());
                }
            }
            name if name.len() <= 255
                && !name.ends_with(['.', ' '])
                && !is_windows_device_name(name) =>
            {
                resolved.push(name.into());
            }
            _ => return Err("Java TAR symlink has an invalid path component".to_owned()),
        }
        if resolved.len() > MAX_PATH_COMPONENTS {
            return Err("Java TAR symlink target is too deeply nested".to_owned());
        }
    }
    Ok(resolved.into_iter().collect())
}

fn ensure_directory_path(root: &Path, relative: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err("Java archive path is not relative".to_owned());
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err("Java archive path conflicts with a non-directory".to_owned());
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(io_message)?;
            }
            Err(error) => return Err(io_message(error)),
        }
    }
    Ok(())
}

fn prepare_file_path(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let parent = relative
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "Java archive file has no parent path".to_owned())?;
    ensure_directory_path(root, parent)?;
    let target = root.join(relative);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("Java archive contains a duplicate or conflicting file path".to_owned());
    }
    Ok(target)
}

fn find_runtime_root(payload: &Path, executable_relative: &str) -> Result<PathBuf, String> {
    if payload.join(executable_relative).is_file() {
        return Ok(payload.to_path_buf());
    }
    let mut matches = Vec::new();
    for entry in fs::read_dir(payload).map_err(io_message)? {
        let entry = entry.map_err(io_message)?;
        if entry.file_type().map_err(io_message)?.is_dir()
            && entry.path().join(executable_relative).is_file()
        {
            matches.push(entry.path());
        }
    }
    match matches.as_slice() {
        [root] => Ok(root.clone()),
        [] => Err("Temurin archive does not contain the expected Java executable".to_owned()),
        _ => Err("Temurin archive contains multiple candidate runtime roots".to_owned()),
    }
}

fn ensure_executable(root: &Path, executable_relative: &str) -> Result<(), String> {
    let executable = root.join(executable_relative);
    let metadata = fs::symlink_metadata(&executable).map_err(io_message)?;
    if metadata.file_type().is_symlink() {
        let canonical_root = fs::canonicalize(root).map_err(io_message)?;
        let canonical_executable = fs::canonicalize(&executable).map_err(io_message)?;
        if !canonical_executable.starts_with(&canonical_root) {
            return Err("Java executable symlink escapes the runtime directory".to_owned());
        }
    } else if !metadata.is_file() {
        return Err("Java executable is not a regular file".to_owned());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).map_err(io_message)?;
    }
    Ok(())
}

fn reject_existing_runtime(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("managed Java runtime path is not a safe directory".to_owned())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_message(error)),
    }
}

fn reject_non_directory_or_symlink(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(io_message)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Java runtime location is not a safe directory".to_owned());
    }
    Ok(())
}

fn set_safe_file_mode(path: &Path, mode: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if mode & 0o111 != 0 {
            fs::set_permissions(path, fs::Permissions::from_mode(0o644 | (mode & 0o111)))
                .map_err(io_message)?;
        }
    }
    #[cfg(not(unix))]
    let _ = (path, mode);
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

fn io_message(error: io::Error) -> String {
    format!("Java runtime archive operation failed: {error}")
}

#[cfg(test)]
#[path = "archive/tests.rs"]
mod tests;
