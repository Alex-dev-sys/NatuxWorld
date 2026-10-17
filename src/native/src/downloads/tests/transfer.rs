use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::cancellation::CancellationToken;

use super::super::{DownloadError, DownloadJob, NetworkFailureKind};
use super::{job, run, server, test_service};
use crate::downloads::transfer::partial_path;

fn request_headers(mut stream: &TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 1024];
    while !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
        match stream.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => bytes.extend_from_slice(&buffer[..count]),
        }
        if bytes.len() > 16 * 1024 {
            break;
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn range_header(request: &str) -> Option<String> {
    request.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("range")
            .then(|| value.trim().to_owned())
    })
}

fn write_response(stream: &mut TcpStream, status: &str, headers: &str, body: &[u8]) {
    let response = format!(
        "HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn body(size: usize) -> Vec<u8> {
    (0..size).map(|index| (index % 251) as u8).collect()
}

fn seed_partial(root: &std::path::Path, destination: &PathBuf, bytes: &[u8]) {
    let target = root.join(destination);
    std::fs::create_dir_all(target.parent().unwrap()).expect("create target directory");
    std::fs::write(partial_path(&target, destination), bytes).expect("seed resumable partial");
}

#[test]
fn cancelled_large_download_is_resumed_with_a_valid_206_range() {
    let payload = body(192 * 1024);
    let prefix_len = 72 * 1024;
    let server_payload = payload.clone();
    let (prefix_sent, prefix_received) = mpsc::channel();
    let ranges = Arc::new(Mutex::new(Vec::new()));
    let server_ranges = Arc::clone(&ranges);
    let server = server(move |mut stream| {
        let request = request_headers(&stream);
        let range = range_header(&request);
        server_ranges.lock().unwrap().push(range.clone());
        if range.is_none() {
            let header = format!(
                "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
                server_payload.len()
            );
            let _ = stream.write_all(header.as_bytes());
            let _ = stream.write_all(&server_payload[..prefix_len]);
            let _ = stream.flush();
            let _ = prefix_sent.send(());
            thread::sleep(Duration::from_millis(300));
            let _ = stream.write_all(&server_payload[prefix_len..]);
        } else {
            let start = prefix_len;
            let headers = format!(
                "Content-Range: bytes {start}-{}/{}\r\n",
                server_payload.len() - 1,
                server_payload.len()
            );
            write_response(
                &mut stream,
                "206 Partial Content",
                &headers,
                &server_payload[start..],
            );
        }
    });
    let root = tempfile::tempdir().expect("create download root");
    let destination = PathBuf::from("runtime/client.jar");
    let service = test_service(&root, 1, 1024 * 1024);
    let download_job = job(format!("{}/client.jar", server.url), &destination, &payload);
    let token = CancellationToken::default();
    let cancel = token.clone();
    let cancel_thread = thread::spawn(move || {
        prefix_received.recv().expect("first response started");
        thread::sleep(Duration::from_millis(50));
        cancel.cancel();
    });

    let cancelled =
        run(service.download_many_cancelable(vec![download_job.clone()], token, |_, _, _| {}));
    cancel_thread.join().expect("join cancellation task");
    assert_eq!(cancelled, Err(DownloadError::Cancelled));
    let partial = partial_path(&root.path().join(&destination), &destination);
    assert!(std::fs::metadata(&partial).unwrap().len() >= 64 * 1024);

    run(service.download_many(vec![download_job], |_, _, _| {}))
        .expect("resume partial from server range");
    assert_eq!(
        ranges.lock().unwrap().as_slice(),
        [None, Some(format!("bytes={prefix_len}-"))].as_slice()
    );
    assert_eq!(
        std::fs::read(root.path().join(destination)).unwrap(),
        payload
    );
    assert!(!partial.exists());
}

#[test]
fn ignored_range_restarts_from_zero_instead_of_appending_full_body() {
    let payload = body(160 * 1024);
    let server_payload = payload.clone();
    let ranges = Arc::new(Mutex::new(Vec::new()));
    let server_ranges = Arc::clone(&ranges);
    let server = server(move |mut stream| {
        let request = request_headers(&stream);
        server_ranges.lock().unwrap().push(range_header(&request));
        write_response(&mut stream, "200 OK", "", &server_payload);
    });
    let root = tempfile::tempdir().expect("create download root");
    let destination = PathBuf::from("client.jar");
    seed_partial(root.path(), &destination, &payload[..72 * 1024]);
    let service = test_service(&root, 1, 1024 * 1024);

    run(service.download_many(
        vec![job(
            format!("{}/client.jar", server.url),
            &destination,
            &payload,
        )],
        |_, _, _| {},
    ))
    .expect("server may ignore Range and return a full response");

    assert_eq!(
        ranges.lock().unwrap().as_slice(),
        [Some("bytes=73728-".to_owned())]
    );
    assert_eq!(
        std::fs::read(root.path().join(destination)).unwrap(),
        payload
    );
}

#[test]
fn malformed_content_range_falls_back_to_a_fresh_full_request() {
    let payload = body(160 * 1024);
    let server_payload = payload.clone();
    let ranges = Arc::new(Mutex::new(Vec::new()));
    let server_ranges = Arc::clone(&ranges);
    let server = server(move |mut stream| {
        let request = request_headers(&stream);
        let range = range_header(&request);
        server_ranges.lock().unwrap().push(range.clone());
        if range.is_some() {
            let headers = format!(
                "Content-Range: bytes 0-{}/{}\r\n",
                server_payload.len() - 1,
                server_payload.len()
            );
            write_response(
                &mut stream,
                "206 Partial Content",
                &headers,
                &server_payload,
            );
        } else {
            write_response(&mut stream, "200 OK", "", &server_payload);
        }
    });
    let root = tempfile::tempdir().expect("create download root");
    let destination = PathBuf::from("client.jar");
    seed_partial(root.path(), &destination, &payload[..72 * 1024]);
    let service = test_service(&root, 1, 1024 * 1024);

    run(service.download_many(
        vec![job(
            format!("{}/client.jar", server.url),
            &destination,
            &payload,
        )],
        |_, _, _| {},
    ))
    .expect("fallback to full response after invalid Content-Range");

    assert_eq!(
        ranges.lock().unwrap().as_slice(),
        [Some("bytes=73728-".to_owned()), None]
    );
    assert_eq!(
        std::fs::read(root.path().join(destination)).unwrap(),
        payload
    );
}

#[test]
fn slow_but_continuous_stream_outlives_the_idle_timeout() {
    let payload = b"continuous response".to_vec();
    let server_payload = payload.clone();
    let server = server(move |mut stream| {
        let _ = request_headers(&stream);
        let header = format!(
            "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
            server_payload.len()
        );
        let _ = stream.write_all(header.as_bytes());
        let _ = stream.flush();
        for byte in &server_payload {
            if stream.write_all(&[*byte]).is_err() {
                break;
            }
            let _ = stream.flush();
            thread::sleep(Duration::from_millis(80));
        }
    });
    let root = tempfile::tempdir().expect("create download root");
    let destination = PathBuf::from("slow.bin");
    let mut service = test_service(&root, 1, 1024);
    service.idle_timeout = Duration::from_millis(300);

    run(service.download_many(
        vec![job(
            format!("{}/slow.bin", server.url),
            &destination,
            &payload,
        )],
        |_, _, _| {},
    ))
    .expect("steady progress resets the idle deadline");
    assert_eq!(
        std::fs::read(root.path().join(destination)).unwrap(),
        payload
    );
}

#[test]
fn stalled_body_times_out_and_retries_the_request() {
    let attempts = Arc::new(AtomicUsize::new(0));
    let server_attempts = Arc::clone(&attempts);
    let server = server(move |mut stream| {
        let _ = request_headers(&stream);
        if server_attempts.fetch_add(1, Ordering::SeqCst) == 0 {
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 2\r\n\r\na");
            let _ = stream.flush();
            thread::sleep(Duration::from_millis(160));
            let _ = stream.write_all(b"b");
        } else {
            write_response(&mut stream, "200 OK", "", b"ab");
        }
    });
    let root = tempfile::tempdir().expect("create download root");
    let destination = PathBuf::from("stalled.bin");
    let mut service = test_service(&root, 1, 1024);
    service.idle_timeout = Duration::from_millis(50);
    let payload = b"ab";

    run(service.download_many(
        vec![job(
            format!("{}/stalled.bin", server.url),
            &destination,
            payload,
        )],
        |_, _, _| {},
    ))
    .expect("retry succeeds after the stalled attempt times out");

    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert_eq!(
        std::fs::read(root.path().join(destination)).unwrap(),
        payload
    );
}

#[test]
fn transient_http_statuses_are_retryable_but_not_client_errors() {
    for status in [408, 425, 429, 500, 502, 599] {
        assert!(
            crate::downloads::is_retryable(&DownloadError::HttpStatus(status)),
            "HTTP {status} should retry"
        );
    }
    for status in [400, 401, 404, 600] {
        assert!(
            !crate::downloads::is_retryable(&DownloadError::HttpStatus(status)),
            "HTTP {status} should not retry"
        );
    }
}

#[test]
fn network_failure_categories_are_safe_and_retryable() {
    let cases = [
        (NetworkFailureKind::Dns, "download host lookup failed"),
        (NetworkFailureKind::Connection, "download connection failed"),
        (NetworkFailureKind::Request, "download request failed"),
        (NetworkFailureKind::Response, "download response failed"),
        (
            NetworkFailureKind::Unknown,
            "download network request failed",
        ),
    ];

    for (kind, message) in cases {
        let error = DownloadError::Network(kind);
        assert_eq!(error.to_string(), message);
        assert!(crate::downloads::is_retryable(&error));
    }
}

#[test]
fn rate_limit_response_uses_the_three_attempt_retry_policy() {
    let attempts = Arc::new(AtomicUsize::new(0));
    let server_attempts = Arc::clone(&attempts);
    let server = server(move |stream| {
        server_attempts.fetch_add(1, Ordering::SeqCst);
        super::respond(stream, "429 Too Many Requests", "", b"");
    });
    let root = tempfile::tempdir().expect("create download root");
    let service = test_service(&root, 1, 1024);
    let result = run(service.download_many(
        vec![DownloadJob {
            url: format!("{}/rate-limited", server.url),
            destination: PathBuf::from("rate.bin"),
            expected_sha1: None,
            expected_sha256: None,
            expected_size: None,
        }],
        |_, _, _| {},
    ));

    assert_eq!(result, Err(DownloadError::HttpStatus(429)));
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
}
