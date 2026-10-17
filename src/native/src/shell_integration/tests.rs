use super::{ensure_screenshots_directory, validate_external_url};
use std::fs;
use tempfile::tempdir;

#[test]
fn external_links_allow_only_http_https_and_plain_mailto_addresses() {
    for url in [
        "https://example.org/path?q=1",
        "http://localhost:8080/",
        "mailto:support@example.org",
        "mailto:launcher+help@sub.example.org",
    ] {
        assert!(
            validate_external_url(url).is_ok(),
            "expected allowed: {url}"
        );
    }

    for url in [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https:",
        "https://user:pass@example.org",
        "https://@example.org",
        "https://example.org/ path",
        " mailto:support@example.org",
        "mailto:support@example.org?subject=Hello",
        "mailto:support@example.org#fragment",
        "mailto:support%0D%0ABcc:attacker@example.org",
        "mailto:one@@example.org",
        "mailto:two,people@example.org",
        "mailto:.leading-dot@example.org",
        "mailto:user@bad..example.org",
    ] {
        assert!(
            validate_external_url(url).is_err(),
            "expected rejected: {url}"
        );
    }
}

#[test]
fn screenshots_directory_is_created_under_canonical_minecraft_root() {
    let temporary = tempdir().expect("temporary directory");
    let minecraft = temporary.path().join("minecraft");

    let screenshots = ensure_screenshots_directory(&minecraft).expect("screenshots folder");
    assert_eq!(
        screenshots,
        minecraft.canonicalize().unwrap().join("screenshots")
    );
    assert!(screenshots.is_dir());
}

#[cfg(unix)]
#[test]
fn screenshots_directory_rejects_symlink_escape() {
    use std::os::unix::fs::symlink;

    let temporary = tempdir().expect("temporary directory");
    let minecraft = temporary.path().join("minecraft");
    let outside = temporary.path().join("outside");
    fs::create_dir_all(&minecraft).unwrap();
    fs::create_dir_all(&outside).unwrap();
    symlink(&outside, minecraft.join("screenshots")).unwrap();

    assert!(ensure_screenshots_directory(&minecraft).is_err());
    assert!(fs::read_dir(&outside).unwrap().next().is_none());
}

#[cfg(windows)]
#[test]
fn screenshots_directory_rejects_directory_symlink_escape() {
    let temporary = tempdir().expect("temporary directory");
    let minecraft = temporary.path().join("minecraft");
    let outside = temporary.path().join("outside");
    fs::create_dir_all(&minecraft).unwrap();
    fs::create_dir_all(&outside).unwrap();
    match std::os::windows::fs::symlink_dir(&outside, minecraft.join("screenshots")) {
        Ok(()) => {}
        Err(error) if error.raw_os_error() == Some(1314) => return,
        Err(error) => panic!("failed to create directory symlink: {error}"),
    }

    assert!(ensure_screenshots_directory(&minecraft).is_err());
    assert!(fs::read_dir(&outside).unwrap().next().is_none());
}
