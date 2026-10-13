use std::io::Write;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use tempfile::TempDir;

use crate::cancellation::CancellationToken;

use super::super::{DownloadError, DownloadJob};
use super::{request_path, run, server, test_service};

#[test]
fn cancellation_stops_inflight_download_and_preserves_existing_file() {
    let server = server(|mut stream| {
        let _ = request_path(&stream);
        let _ = stream.write_all(
            b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 1024\r\n\r\npartial",
        );
        let _ = stream.flush();
        thread::sleep(Duration::from_millis(500));
        let _ = stream.write_all(&vec![b'x'; 1017]);
    });
    let root = TempDir::new().expect("create temporary root");
    let destination = PathBuf::from("runtime/jre.zip");
    std::fs::create_dir_all(root.path().join("runtime")).expect("create destination folder");
    std::fs::write(root.path().join(&destination), b"previous verified archive")
        .expect("seed prior archive");
    let service = test_service(&root, 1, 2048);
    let token = CancellationToken::default();
    let cancel = token.clone();
    let cancel_thread = thread::spawn(move || {
        thread::sleep(Duration::from_millis(100));
        cancel.cancel();
    });
    let result = run(service.download_many_cancelable(
        vec![DownloadJob {
            url: format!("{}/slow.zip", server.url),
            destination: destination.clone(),
            expected_sha1: None,
            expected_sha256: None,
            expected_size: Some(1024),
        }],
        token,
        |_, _, _| {},
    ));
    cancel_thread.join().expect("join cancellation thread");

    assert_eq!(result, Err(DownloadError::Cancelled));
    assert_eq!(
        std::fs::read(root.path().join(&destination)).expect("read prior archive"),
        b"previous verified archive"
    );
    assert!(!std::fs::read_dir(root.path().join("runtime"))
        .expect("list runtime directory")
        .any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")));
}
