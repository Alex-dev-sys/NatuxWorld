use std::fs::File;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha512};
use tauri::{AppHandle, Manager};

use super::manifest::ControlManifest;

#[derive(Debug, PartialEq, Eq)]
pub(super) enum IntegrityResult {
    Verified,
    LegacyOrDifferentVersion,
    Mismatch,
}

pub(super) fn schedule(app: &AppHandle) {
    let state = app.state::<super::UpdaterState>();
    if state
        .integrity_started
        .swap(true, std::sync::atomic::Ordering::AcqRel)
    {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(8)).await;
        let settings = app.state::<crate::settings::SettingsStore>();
        let Ok(settings) = settings.get() else {
            return;
        };
        // Network/key failures are handled by update checks. Do not mistake an
        // unavailable feed for a modified binary or prevent an offline launch.
        let Ok(control) = super::fetch_control(&settings.update_channel).await else {
            return;
        };
        let Ok(executable) = std::env::current_exe() else {
            return;
        };
        let version = app.package_info().version.to_string();
        let result = tauri::async_runtime::spawn_blocking(move || {
            check_installed(
                &control,
                &version,
                std::env::consts::OS,
                std::env::consts::ARCH,
                &executable,
            )
        })
        .await;
        if matches!(result, Ok(Ok(IntegrityResult::Mismatch))) {
            super::emit_error(&app, "Launcher integrity check failed: installed binary does not match its signed executable hash");
        }
    });
}

fn platform(target_os: &str, arch: &str) -> Option<&'static str> {
    match (target_os, arch) {
        ("windows", "x86_64") => Some("windows-x86_64"),
        ("macos", "x86_64") => Some("darwin-x86_64"),
        ("macos", "aarch64") => Some("darwin-aarch64"),
        _ => None,
    }
}

pub(super) fn check_installed(
    control: &ControlManifest,
    installed_version: &str,
    target_os: &str,
    arch: &str,
    executable: &Path,
) -> Result<IntegrityResult, String> {
    // A newer feed describes a different binary. Legacy manifests have no hash.
    // Neither is evidence that this installation was modified.
    if control.version != installed_version {
        return Ok(IntegrityResult::LegacyOrDifferentVersion);
    }
    let Some(expected) =
        platform(target_os, arch).and_then(|platform| control.executable_hashes.get(platform))
    else {
        return Ok(IntegrityResult::LegacyOrDifferentVersion);
    };
    let mut file =
        File::open(executable).map_err(|_| "Cannot read installed launcher executable")?;
    let mut hash = Sha512::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "Cannot hash installed launcher executable")?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(if format!("{:x}", hash.finalize()) == *expected {
        IntegrityResult::Verified
    } else {
        IntegrityResult::Mismatch
    })
}

#[cfg(test)]
mod tests {
    use super::{check_installed, IntegrityResult};
    use crate::updater::manifest::{validate_control, ControlManifest};
    use sha2::{Digest, Sha512};

    fn control(hash: &str) -> ControlManifest {
        serde_json::from_value(serde_json::json!({
            "schemaVersion": 1, "repository": "Alex-dev-sys/NatuxWorld", "channel": "stable",
            "version": "1.9.15", "rolloutPct": 0,
            "feedUrl": "https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.15/latest.json",
            "executableHashes": { "windows-x86_64": hash }
        })).expect("control fixture")
    }

    #[test]
    fn installed_binary_is_checked_independently_of_installer_and_rollout() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let binary = directory.path().join("launcher.exe");
        std::fs::write(&binary, b"installed native executable").expect("binary fixture");
        let digest = format!("{:x}", Sha512::digest(b"installed native executable"));
        let signed = control(&digest);
        validate_control(&signed, "stable").expect("valid control");
        assert_eq!(
            check_installed(&signed, "1.9.15", "windows", "x86_64", &binary),
            Ok(IntegrityResult::Verified)
        );
        std::fs::write(&binary, b"modified executable").expect("alter binary");
        assert_eq!(
            check_installed(&signed, "1.9.15", "windows", "x86_64", &binary),
            Ok(IntegrityResult::Mismatch)
        );
        let installer_hash = format!("{:x}", Sha512::digest(b"NSIS installer"));
        assert_ne!(installer_hash, digest);
    }

    #[test]
    fn missing_old_or_other_platform_hash_never_reads_binary() {
        let mut signed = control(&"ab".repeat(64));
        let missing = std::path::Path::new("absent-native-executable");
        assert_eq!(
            check_installed(&signed, "1.9.14", "windows", "x86_64", missing),
            Ok(IntegrityResult::LegacyOrDifferentVersion)
        );
        assert_eq!(
            check_installed(&signed, "1.9.15", "macos", "aarch64", missing),
            Ok(IntegrityResult::LegacyOrDifferentVersion)
        );
        signed.executable_hashes.clear();
        assert_eq!(
            check_installed(&signed, "1.9.15", "windows", "x86_64", missing),
            Ok(IntegrityResult::LegacyOrDifferentVersion)
        );
    }

    #[test]
    fn expected_current_hash_with_unreadable_binary_is_an_error() {
        let signed = control(&"ab".repeat(64));
        assert!(check_installed(
            &signed,
            "1.9.15",
            "windows",
            "x86_64",
            std::path::Path::new("absent-native-executable")
        )
        .is_err());
    }
}
