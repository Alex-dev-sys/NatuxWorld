use super::{
    is_java_executable, is_windows_unc, java_major, join_output_until, parse_java_version,
    JavaSelectionStore, JavaVerification,
};
use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

#[test]
fn accepts_only_local_canonical_file_selected_for_same_window() {
    let directory = tempfile::tempdir().unwrap();
    let java = directory.path().join("java.exe");
    fs::write(&java, b"test executable placeholder").unwrap();
    let store = JavaSelectionStore::default();

    let canonical = store.approve("main", &java).unwrap();
    assert_eq!(Path::new(&canonical), java.canonicalize().unwrap());
    assert!(store.consume_approval("secondary", &canonical).is_err());
    assert!(store
        .consume_approval("main", &java.to_string_lossy())
        .is_err());

    let selected_again = store.approve("main", &java).unwrap();
    assert_eq!(
        store.consume_approval("main", &selected_again).unwrap(),
        java.canonicalize().unwrap()
    );
    assert!(store.consume_approval("main", &selected_again).is_err());
}

#[cfg(unix)]
#[test]
fn rejects_symbolic_link_selections() {
    use std::os::unix::fs::symlink;

    let directory = tempfile::tempdir().unwrap();
    let actual = directory.path().join("java.exe");
    let link = directory.path().join("java-link.exe");
    fs::write(&actual, b"test executable placeholder").unwrap();
    symlink(&actual, &link).unwrap();

    assert!(JavaSelectionStore::default()
        .approve("main", &link)
        .is_err());
}

#[test]
fn rejects_unc_and_device_paths_but_allows_local_verbatim_windows_path() {
    assert!(is_windows_unc(r"\\server\share\java.exe"));
    assert!(is_windows_unc(r"\\?\UNC\server\share\java.exe"));
    assert!(is_windows_unc(r"\\.\COM1"));
    assert!(!is_windows_unc(r"\\?\C:\Java\bin\java.exe"));
    assert!(!is_windows_unc(r"C:\Java\bin\java.exe"));
}

#[test]
fn accepts_only_java_executable_names() {
    assert!(is_java_executable(Path::new("/opt/jre/bin/java")));
    assert!(is_java_executable(Path::new("C:\\Java\\bin\\javaw.exe")));
    assert!(!is_java_executable(Path::new("/opt/jre/bin/javac")));
    assert!(!is_java_executable(Path::new("/opt/jre/bin/java.exe.bak")));
}

#[test]
fn parses_java_21_and_legacy_version_shapes() {
    assert_eq!(
        parse_java_version("openjdk version \"21.0.2\" 2024-01-16"),
        Some("21.0.2".to_owned())
    );
    assert_eq!(
        parse_java_version("openjdk 21.0.3 2024-04-16"),
        Some("21.0.3".to_owned())
    );
    assert_eq!(java_major("1.8.0_392"), Some(8));
    assert_eq!(java_major("21-ea+12"), Some(21));
    assert_eq!(parse_java_version("javac 21.0.2"), None);
}

#[test]
fn java_probe_reader_wait_respects_the_shared_deadline() {
    let reader = thread::spawn(|| {
        thread::sleep(Duration::from_millis(100));
        Vec::new()
    });
    let result = join_output_until(reader, Instant::now() + Duration::from_millis(10));

    assert!(result.is_err());
}

#[test]
fn verification_result_matches_the_renderer_contract() {
    assert_eq!(
        serde_json::to_value(JavaVerification::success("21.0.2".to_owned())).unwrap(),
        serde_json::json!({ "ok": true, "version": "21.0.2" })
    );
    assert_eq!(
        serde_json::to_value(JavaVerification::failure("Java 21 is required")).unwrap(),
        serde_json::json!({ "ok": false, "error": "Java 21 is required" })
    );
}
