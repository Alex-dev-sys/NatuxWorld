use super::manifest::REPOSITORY;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum UpdateMode {
    Automatic,
    Manual,
    Unsupported,
}

pub(super) fn update_mode(target_os: &str, portable: bool) -> UpdateMode {
    match target_os {
        "windows" if portable => UpdateMode::Manual,
        "windows" => UpdateMode::Automatic,
        "macos" => UpdateMode::Manual,
        _ => UpdateMode::Unsupported,
    }
}

pub(super) fn current_update_mode() -> Result<UpdateMode, String> {
    let portable = crate::profile_paths::portable_user_data_dir()
        .map_err(|_| "Cannot verify portable update policy")?
        .is_some();
    Ok(update_mode(std::env::consts::OS, portable))
}

pub(super) fn manual_release_url(version: &str) -> String {
    format!("https://github.com/{REPOSITORY}/releases/tag/v{version}")
}

#[cfg(test)]
mod tests {
    use super::{manual_release_url, update_mode, UpdateMode};

    #[test]
    fn release_update_modes_match_available_platform_packages() {
        assert_eq!(update_mode("windows", false), UpdateMode::Automatic);
        assert_eq!(update_mode("macos", false), UpdateMode::Manual);
        assert_eq!(update_mode("linux", false), UpdateMode::Unsupported);
        assert_eq!(update_mode("freebsd", false), UpdateMode::Unsupported);
    }

    #[test]
    fn portable_distributions_never_download_or_install_nsis_updates() {
        assert_eq!(update_mode("windows", true), UpdateMode::Manual);
        assert_eq!(update_mode("macos", true), UpdateMode::Manual);
        assert_eq!(update_mode("linux", true), UpdateMode::Unsupported);
    }

    #[test]
    fn manual_update_uses_the_exact_versioned_release_page() {
        assert_eq!(
            manual_release_url("1.9.16-beta.2"),
            "https://github.com/Alex-dev-sys/NatuxWorld/releases/tag/v1.9.16-beta.2"
        );
    }
}
