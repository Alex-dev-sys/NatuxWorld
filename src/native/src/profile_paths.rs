#[cfg(any(target_os = "windows", test))]
use std::fs;
use std::io;
#[cfg(any(target_os = "windows", test))]
use std::io::Read;
#[cfg(not(any(target_os = "windows", test)))]
use std::path::PathBuf;
#[cfg(any(target_os = "windows", test))]
use std::path::{Path, PathBuf};

#[cfg(any(target_os = "windows", test))]
use serde::Deserialize;

pub(crate) fn configure_portable_context(
    context: &mut tauri::Context<tauri::Wry>,
    profile: &std::path::Path,
) {
    use sha2::{Digest, Sha256};
    let suffix = format!(
        "{:x}",
        Sha256::digest(profile.as_os_str().to_string_lossy().as_bytes())
    );
    // The instance mutex belongs to this profile, not to every copy of the app.
    context.config_mut().identifier = format!("world.natux.launcher.portable.{}", &suffix[..24]);
    context.config_mut().app.app_directories_override = Some(
        tauri::utils::config::AppDirectoriesOverride::Root(profile.to_path_buf()),
    );
    for window in &mut context.config_mut().app.windows {
        window.data_directory = Some(profile.join("webview"));
    }
}

#[cfg(any(target_os = "windows", test))]
const MARKER: &str = "natux-portable.json";
#[cfg(any(target_os = "windows", test))]
const PROFILE: &str = "profile";

#[cfg(any(target_os = "windows", test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PortableMarker {
    schema_version: u8,
    profile_directory: String,
}

pub(crate) fn portable_user_data_dir() -> io::Result<Option<PathBuf>> {
    // Only Windows portable distribution is published. Other platforms retain
    // their existing application-data contract.
    #[cfg(target_os = "windows")]
    {
        let executable = std::env::current_exe()?;
        portable_dir_for(&executable)
    }
    #[cfg(not(target_os = "windows"))]
    Ok(None)
}

#[cfg(any(target_os = "windows", test))]
fn portable_dir_for(executable: &Path) -> io::Result<Option<PathBuf>> {
    let directory = executable
        .parent()
        .ok_or_else(|| invalid("Executable directory is missing"))?;
    let marker_path = directory.join(MARKER);
    let metadata = match fs::symlink_metadata(&marker_path) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 1024 {
        return Err(invalid("Invalid portable profile marker"));
    }
    let mut marker_bytes = Vec::new();
    fs::File::open(marker_path)?
        .take(1025)
        .read_to_end(&mut marker_bytes)?;
    if marker_bytes.len() > 1024 {
        return Err(invalid("Portable profile marker is too large"));
    }
    let marker: PortableMarker = serde_json::from_slice(&marker_bytes)
        .map_err(|_| invalid("Invalid portable profile marker"))?;
    if marker.schema_version != 1 || marker.profile_directory != PROFILE {
        return Err(invalid("Invalid portable profile directory"));
    }
    let root = fs::canonicalize(directory)?;
    let profile = root.join(PROFILE);
    match fs::symlink_metadata(&profile) {
        Ok(value) if !value.is_dir() || value.file_type().is_symlink() => {
            return Err(invalid("Portable profile must be a local directory"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => fs::create_dir(&profile)?,
        Err(error) => return Err(error),
    }
    let canonical = fs::canonicalize(&profile)?;
    if canonical.parent() != Some(root.as_path()) {
        return Err(invalid(
            "Portable profile escaped its application directory",
        ));
    }
    Ok(Some(canonical))
}

#[cfg(any(target_os = "windows", test))]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_marker_preserves_installed_profile_contract() {
        let temporary = tempfile::tempdir().unwrap();
        assert_eq!(
            portable_dir_for(&temporary.path().join("launcher.exe")).unwrap(),
            None
        );
        assert!(!temporary.path().join(PROFILE).exists());
    }

    #[test]
    fn marker_selects_a_sibling_profile_and_reopening_keeps_it() {
        let temporary = tempfile::tempdir().unwrap();
        fs::write(
            temporary.path().join(MARKER),
            r#"{"schemaVersion":1,"profileDirectory":"profile"}"#,
        )
        .unwrap();
        let executable = temporary.path().join("launcher.exe");
        let profile = portable_dir_for(&executable).unwrap().unwrap();
        fs::write(profile.join("settings.json"), b"fixture").unwrap();
        assert_eq!(
            portable_dir_for(&executable).unwrap(),
            Some(profile.clone())
        );
        assert_eq!(fs::read(profile.join("settings.json")).unwrap(), b"fixture");
    }

    #[test]
    fn unsafe_marker_fails_before_creating_a_profile() {
        let temporary = tempfile::tempdir().unwrap();
        for marker in [
            r#"{"schemaVersion":1,"profileDirectory":"../outside"}"#,
            r#"{"schemaVersion":2,"profileDirectory":"profile"}"#,
            "not json",
        ] {
            fs::write(temporary.path().join(MARKER), marker).unwrap();
            assert!(portable_dir_for(&temporary.path().join("launcher.exe")).is_err());
            assert!(!temporary.path().join(PROFILE).exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn linked_profile_is_rejected() {
        let temporary = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(
            temporary.path().join(MARKER),
            r#"{"schemaVersion":1,"profileDirectory":"profile"}"#,
        )
        .unwrap();
        std::os::unix::fs::symlink(outside.path(), temporary.path().join(PROFILE)).unwrap();
        assert!(portable_dir_for(&temporary.path().join("launcher.exe")).is_err());
    }
}
