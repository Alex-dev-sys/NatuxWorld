use std::future::Future;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use sha1::{Digest, Sha1};
use sha2::Sha256;
use tempfile::TempDir;

use super::{DownloadError, DownloadJob, DownloadService};

#[path = "tests/cancellation.rs"]
mod cancellation;
#[path = "tests/transfer.rs"]
mod transfer;

struct MockServer {
    url: String,
    shutdown: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl Drop for MockServer {
    fn drop(&mut self) {
        let _ = self.shutdown.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn server(handler: impl Fn(TcpStream) + Send + Sync + 'static) -> MockServer {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test server");
    listener.set_nonblocking(true).expect("set nonblocking");
    let address = listener.local_addr().expect("read test server address");
    let (shutdown, receiver) = mpsc::channel();
    let handler = Arc::new(handler);
    let thread = thread::spawn(move || loop {
        if receiver.try_recv().is_ok() {
            break;
        }
        match listener.accept() {
            Ok((stream, _)) => {
                stream
                    .set_nonblocking(false)
                    .expect("make accepted test socket blocking");
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let handler = Arc::clone(&handler);
                thread::spawn(move || handler(stream));
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(2));
            }
            Err(_) => break,
        }
    });
    MockServer {
        url: format!("http://{address}"),
        shutdown,
        thread: Some(thread),
    }
}

fn request_path(mut stream: &TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 1024];
    while !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(count) => bytes.extend_from_slice(&chunk[..count]),
        }
        if bytes.len() > 16 * 1024 {
            break;
        }
    }
    String::from_utf8_lossy(&bytes)
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or_default()
        .to_owned()
}

fn respond(mut stream: TcpStream, status: &str, extra_headers: &str, body: &[u8]) {
    let _ = request_path(&stream);
    let response = format!(
        "HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n{extra_headers}\r\n",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn run<F: Future>(future: F) -> F::Output {
    tauri::async_runtime::block_on(future)
}

fn test_service(root: &TempDir, max_concurrent: usize, max_file_size: u64) -> DownloadService {
    DownloadService::build(
        root.path(),
        ["127.0.0.1"],
        max_concurrent,
        max_file_size,
        true,
    )
    .expect("construct test-only loopback downloader")
}

fn job(url: String, destination: impl AsRef<Path>, body: &[u8]) -> DownloadJob {
    DownloadJob {
        url,
        destination: destination.as_ref().to_path_buf(),
        expected_sha1: Some(format!("{:x}", Sha1::digest(body))),
        expected_sha256: Some(format!("{:x}", Sha256::digest(body))),
        expected_size: Some(body.len() as u64),
    }
}

#[test]
fn downloads_and_verifies_sha256_without_sha1() {
    let body = b"Temurin archive bytes".to_vec();
    let hits = Arc::new(AtomicUsize::new(0));
    let server_hits = Arc::clone(&hits);
    let server_body = body.clone();
    let server = server(move |stream| {
        server_hits.fetch_add(1, Ordering::SeqCst);
        respond(stream, "200 OK", "", &server_body);
    });
    let root = TempDir::new().expect("create temporary root");
    let service = test_service(&root, 1, 1024);
    let mut archive = job(format!("{}/jre.zip", server.url), "runtime/jre.zip", &body);
    archive.expected_sha1 = None;

    run(service.download_many(vec![archive], |_, _, _| {})).expect("download and verify SHA-256");
    let mut cached_archive = job(format!("{}/jre.zip", server.url), "runtime/jre.zip", &body);
    cached_archive.expected_sha1 = None;
    run(service.download_many(vec![cached_archive], |_, _, _| {}))
        .expect("reuse SHA-256 verified archive");

    assert_eq!(hits.load(Ordering::SeqCst), 1);
    assert_eq!(
        std::fs::read(root.path().join("runtime/jre.zip")).expect("read archive"),
        body
    );
}

#[test]
fn verified_download_replaces_a_stale_file() {
    let body = b"replacement artifact".to_vec();
    let server_body = body.clone();
    let server = server(move |stream| respond(stream, "200 OK", "", &server_body));
    let root = TempDir::new().expect("create temporary root");
    let destination = PathBuf::from("artifact.bin");
    std::fs::write(root.path().join(&destination), b"stale bytes").expect("seed stale file");
    let service = test_service(&root, 1, 1024);

    run(service.download_many(
        vec![job(format!("{}/artifact", server.url), &destination, &body)],
        |_, _, _| {},
    ))
    .expect("replace stale cache with verified artifact");

    assert_eq!(std::fs::read(root.path().join(destination)).unwrap(), body);
}

#[test]
fn downloads_and_verifies_sha1_and_size_from_local_server() {
    let body = b"the quick brown fox jumps over the lazy dog".to_vec();
    let expected_size = body.len() as u64;
    let server = server(move |stream| respond(stream, "200 OK", "", &body));
    let root = TempDir::new().expect("create temporary root");
    let service = test_service(&root, 2, 1024);
    let destination = PathBuf::from("libraries/example.jar");
    let progress = Arc::new(Mutex::new(Vec::new()));
    let received_progress = Arc::clone(&progress);

    run(service.download_many(
        vec![job(
            format!("{}/artifact", server.url),
            &destination,
            b"the quick brown fox jumps over the lazy dog",
        )],
        move |completed, total, _| received_progress.lock().unwrap().push((completed, total)),
    ))
    .expect("download local test artifact");

    let progress = progress.lock().unwrap();
    assert!(!progress.is_empty());
    assert_eq!(progress.last(), Some(&(expected_size, expected_size)));
    assert!(progress.windows(2).all(|window| window[0].0 <= window[1].0));
    drop(progress);

    assert_eq!(
        std::fs::read(root.path().join(destination)).expect("read downloaded file"),
        b"the quick brown fox jumps over the lazy dog"
    );
}

#[test]
fn verified_cache_is_skipped_and_duplicate_jobs_report_once() {
    let body = b"cached asset".to_vec();
    let hits = Arc::new(AtomicUsize::new(0));
    let server_hits = Arc::clone(&hits);
    let server_body = body.clone();
    let server = server(move |stream| {
        server_hits.fetch_add(1, Ordering::SeqCst);
        respond(stream, "200 OK", "", &server_body);
    });
    let root = TempDir::new().expect("create temporary root");
    let destination = PathBuf::from("assets/cached.bin");
    std::fs::create_dir(root.path().join("assets")).expect("create asset directory");
    std::fs::write(root.path().join(&destination), &body).expect("write cached file");
    let service = test_service(&root, 4, 1024);
    let asset = job(format!("{}/cached", server.url), &destination, &body);
    let progress = Arc::new(AtomicUsize::new(0));
    let progress_calls = Arc::clone(&progress);

    run(
        service.download_many(vec![asset.clone(), asset], move |_, _, _| {
            progress_calls.fetch_add(1, Ordering::SeqCst);
        }),
    )
    .expect("validate cached asset");

    assert_eq!(hits.load(Ordering::SeqCst), 0);
    assert_eq!(progress.load(Ordering::SeqCst), 1);
}

#[test]
fn integrity_mismatch_never_replaces_an_existing_file() {
    let body = b"server bytes".to_vec();
    let server_body = body.clone();
    let server = server(move |stream| respond(stream, "200 OK", "", &server_body));
    let root = TempDir::new().expect("create temporary root");
    let destination = PathBuf::from("artifact.bin");
    std::fs::write(root.path().join(&destination), b"old safe bytes").expect("seed old file");
    let service = test_service(&root, 1, 1024);
    let mut asset = job(format!("{}/artifact", server.url), &destination, &body);
    asset.expected_sha1 = Some("0".repeat(40));

    let result = run(service.download_many(vec![asset], |_, _, _| {}));

    assert_eq!(result, Err(DownloadError::Sha1Mismatch));
    assert_eq!(
        std::fs::read(root.path().join(destination)).expect("read old file"),
        b"old safe bytes"
    );
    assert!(!std::fs::read_dir(root.path())
        .expect("list temp root")
        .any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")));
}

#[test]
fn sha256_mismatch_never_replaces_an_existing_file() {
    let body = b"archive bytes from server".to_vec();
    let server_body = body.clone();
    let server = server(move |stream| respond(stream, "200 OK", "", &server_body));
    let root = TempDir::new().expect("create temporary root");
    let destination = PathBuf::from("runtime.zip");
    std::fs::write(root.path().join(&destination), b"old valid archive")
        .expect("seed prior archive");
    let service = test_service(&root, 1, 1024);
    let mut archive = job(format!("{}/runtime.zip", server.url), &destination, &body);
    archive.expected_sha1 = None;
    archive.expected_sha256 = Some("0".repeat(64));

    let result = run(service.download_many(vec![archive], |_, _, _| {}));

    assert_eq!(result, Err(DownloadError::Sha256Mismatch));
    assert_eq!(
        std::fs::read(root.path().join(destination)).expect("read old archive"),
        b"old valid archive"
    );
}

#[test]
fn rejects_http_protocol_in_production_policy_before_connecting() {
    let root = TempDir::new().expect("create temporary root");
    let service = DownloadService::with_policy(root.path(), ["example.com"], 1, 1024)
        .expect("construct production policy");
    let result = run(service.download_many(
        vec![DownloadJob {
            url: "http://example.com/file".to_owned(),
            destination: PathBuf::from("file.bin"),
            expected_sha1: None,
            expected_sha256: None,
            expected_size: None,
        }],
        |_, _, _| {},
    ));

    assert_eq!(result, Err(DownloadError::UnsafeProtocol));
}

#[test]
fn rejects_redirect_to_untrusted_host() {
    let server = server(|stream| {
        respond(
            stream,
            "302 Found",
            "Location: https://untrusted.example/payload\r\n",
            b"",
        );
    });
    let root = TempDir::new().expect("create temporary root");
    let service = test_service(&root, 1, 1024);
    let result = run(service.download_many(
        vec![DownloadJob {
            url: format!("{}/redirect", server.url),
            destination: PathBuf::from("file.bin"),
            expected_sha1: None,
            expected_sha256: None,
            expected_size: None,
        }],
        |_, _, _| {},
    ));

    assert_eq!(result, Err(DownloadError::UntrustedHost));
}

#[test]
fn enforces_hard_size_cap_without_content_length() {
    let body = b"too large".to_vec();
    let server = server(move |mut stream| {
        let _ = request_path(&stream);
        let _ = stream.write_all(
            format!(
                "HTTP/1.1 200 OK\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n{:X}\r\n",
                body.len()
            )
            .as_bytes(),
        );
        let _ = stream.write_all(&body);
        let _ = stream.write_all(b"\r\n0\r\n\r\n");
    });
    let root = TempDir::new().expect("create temporary root");
    let service = test_service(&root, 1, 4);
    let result = run(service.download_many(
        vec![DownloadJob {
            url: format!("{}/oversize", server.url),
            destination: PathBuf::from("oversize.bin"),
            expected_sha1: None,
            expected_sha256: None,
            expected_size: None,
        }],
        |_, _, _| {},
    ));

    assert_eq!(result, Err(DownloadError::SizeLimitExceeded));
    assert!(!root.path().join("oversize.bin").exists());
}

#[test]
fn rejects_traversal_and_windows_path_forms() {
    for destination in [
        PathBuf::from("../outside.bin"),
        PathBuf::from("nested/../../outside.bin"),
        PathBuf::from(r"..\outside.bin"),
        PathBuf::from(r"C:\outside.bin"),
        PathBuf::from("NUL.txt"),
    ] {
        let root = TempDir::new().expect("create temporary root");
        let service = test_service(&root, 1, 1024);
        let result = run(service.download_many(
            vec![DownloadJob {
                url: "http://127.0.0.1:1/file".to_owned(),
                destination,
                expected_sha1: None,
                expected_sha256: None,
                expected_size: None,
            }],
            |_, _, _| {},
        ));
        assert_eq!(result, Err(DownloadError::InvalidDestination));
    }
}

#[cfg(unix)]
#[test]
fn refuses_existing_symlink_parent_and_target() {
    use std::os::unix::fs::symlink;

    let root = TempDir::new().expect("create temporary root");
    let outside = TempDir::new().expect("create external directory");
    symlink(outside.path(), root.path().join("linked-dir")).expect("create directory symlink");
    symlink(
        outside.path().join("victim.bin"),
        root.path().join("linked-file.bin"),
    )
    .expect("create file symlink");
    let service = test_service(&root, 1, 1024);

    for destination in [
        PathBuf::from("linked-dir/file.bin"),
        PathBuf::from("linked-file.bin"),
    ] {
        let result = run(service.download_many(
            vec![DownloadJob {
                url: "http://127.0.0.1:1/file".to_owned(),
                destination,
                expected_sha1: None,
                expected_sha256: None,
                expected_size: None,
            }],
            |_, _, _| {},
        ));
        assert_eq!(result, Err(DownloadError::UnsafeDestination));
    }
    assert!(!outside.path().join("victim.bin").exists());
}

#[test]
fn concurrent_batches_for_one_destination_download_only_once() {
    let body = b"shared artifact".to_vec();
    let hits = Arc::new(AtomicUsize::new(0));
    let server_hits = Arc::clone(&hits);
    let server_body = body.clone();
    let server = server(move |stream| {
        server_hits.fetch_add(1, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(30));
        respond(stream, "200 OK", "", &server_body);
    });
    let root = TempDir::new().expect("create temporary root");
    let service = Arc::new(test_service(&root, 2, 1024));
    let asset = job(format!("{}/shared", server.url), "shared.bin", &body);
    let first_service = Arc::clone(&service);
    let first_asset = asset.clone();
    let first =
        thread::spawn(move || run(first_service.download_many(vec![first_asset], |_, _, _| {})));
    let second_service = Arc::clone(&service);
    let second =
        thread::spawn(move || run(second_service.download_many(vec![asset], |_, _, _| {})));

    first
        .join()
        .expect("join first caller")
        .expect("first download");
    second
        .join()
        .expect("join second caller")
        .expect("second cache check");

    assert_eq!(hits.load(Ordering::SeqCst), 1);
    assert_eq!(std::fs::read(root.path().join("shared.bin")).unwrap(), body);
}

#[test]
fn conflicting_jobs_for_one_target_are_rejected_before_network_access() {
    let root = TempDir::new().expect("create temporary root");
    let service =
        DownloadService::with_policy(root.path(), ["one.example", "two.example"], 2, 1024)
            .expect("construct production policy");
    let result = run(service.download_many(
        vec![
            DownloadJob {
                url: "https://one.example/file".to_owned(),
                destination: PathBuf::from("same.bin"),
                expected_sha1: Some("a".repeat(40)),
                expected_sha256: None,
                expected_size: Some(1),
            },
            DownloadJob {
                url: "https://two.example/file".to_owned(),
                destination: PathBuf::from("same.bin"),
                expected_sha1: Some("b".repeat(40)),
                expected_sha256: None,
                expected_size: Some(1),
            },
        ],
        |_, _, _| {},
    ));

    assert_eq!(result, Err(DownloadError::ConflictingDestination));
}
