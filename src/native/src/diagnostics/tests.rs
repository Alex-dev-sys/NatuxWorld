use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use reqwest::Url;
use serde_json::json;

use super::{
    check_memory_total, free_bytes, DiagnosticCheck, DiagnosticsService, MAX_RESPONSE_BYTES,
};

#[test]
fn diagnostic_check_serializes_to_the_shared_camel_case_contract() {
    let check = DiagnosticCheck {
        id: "site".to_owned(),
        label: "Сайт и авторизация".to_owned(),
        ok: true,
        detail: None,
    };
    let value = serde_json::to_value(check).expect("serializable check");
    assert_eq!(value["id"], "site");
    assert_eq!(value["label"], "Сайт и авторизация");
    assert_eq!(value["ok"], true);
    assert!(value.get("detail").is_none());
}

#[test]
fn memory_check_reports_memory_build_and_platform() {
    let check = check_memory_total(8 * 1024 * 1024 * 1024);
    assert!(check.ok);
    let detail = check.detail.expect("memory detail");
    assert!(detail.contains("8.0 GB"));
    assert!(detail.contains(env!("CARGO_PKG_VERSION")));
    assert!(detail.contains(std::env::consts::OS));
    assert!(detail.contains(std::env::consts::ARCH));
    assert!(!check_memory_total(2 * 1024 * 1024 * 1024).ok);
}

#[test]
fn disk_probe_uses_an_existing_parent_without_creating_the_requested_directory() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let missing = temporary.path().join("minecraft").join("future");
    assert!(!missing.exists());

    let available = free_bytes(&missing).expect("free space on nearest existing parent");
    assert!(available > 0);
    assert!(!missing.exists());
}

#[tokio::test]
async fn site_probe_accepts_a_bounded_success_response() {
    let (origin, server) = local_server(
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".to_vec(),
    );
    let service = local_service(origin);

    let check = service.check_site().await;
    server.join().expect("local response completed");

    assert!(check.ok);
    assert_eq!(check.id, "site");
    assert!(check.detail.unwrap().contains("Ответ за"));
}

#[tokio::test]
async fn site_probe_does_not_follow_redirects() {
    let (origin, server) = local_server(
        b"HTTP/1.1 302 Found\r\nLocation: https://example.com/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            .to_vec(),
    );
    let service = local_service(origin);

    let check = service.check_site().await;
    server.join().expect("local response completed");

    assert!(!check.ok);
    assert!(check.detail.unwrap().contains("HTTP 302"));
}

#[tokio::test]
async fn site_probe_rejects_responses_over_the_body_limit() {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        MAX_RESPONSE_BYTES + 1
    );
    let (origin, server) = local_server(response.into_bytes());
    let service = local_service(origin);

    let check = service.check_site().await;
    server.join().expect("local response completed");

    assert!(!check.ok);
    assert!(check
        .detail
        .unwrap()
        .contains("превышает допустимый размер"));
}

#[tokio::test]
async fn diagnostics_run_includes_the_updates_check_in_electron_order() {
    let temporary = tempfile::tempdir().expect("temporary Minecraft directory");
    let signing_key = SigningKey::from_bytes(&[42; 32]);
    let control = json!({
        "schemaVersion": 1,
        "repository": "Alex-dev-sys/NatuxWorld",
        "channel": "stable",
        "version": "1.9.16",
        "rolloutPct": 100,
        "feedUrl": "https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/latest.json",
        "migrationEnabled": false,
    })
    .to_string();
    let signature = STANDARD.encode(signing_key.sign(control.as_bytes()).to_bytes());
    let feed = json!({
        "version": "1.9.16",
        "notes": "test",
        "pub_date": "2026-10-12T00:00:00Z",
        "platforms": {
            "windows-x86_64": {
                "signature": "test-signature",
                "url": "https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/NatuxWorld-1.9.16-x64-setup.exe"
            }
        }
    })
    .to_string();
    let (origin, server) = local_server_routed(
        [
            (
                "/api/server/status".to_owned(),
                http_response("200 OK", b"{}"),
            ),
            (
                "/releases/download/tauri-stable-feed/natux-tauri-control.json".to_owned(),
                http_response("200 OK", control.as_bytes()),
            ),
            (
                "/releases/download/tauri-stable-feed/natux-tauri-control.json.sig".to_owned(),
                http_response("200 OK", signature.as_bytes()),
            ),
            (
                "/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/latest.json".to_owned(),
                http_response("200 OK", feed.as_bytes()),
            ),
        ],
        4,
    );
    let service = DiagnosticsService::for_localhost_test(temporary.path().to_path_buf(), origin)
        .expect("localhost diagnostics service");

    let checks = service.run().await;
    let requests = server.join().expect("all local probes completed");

    assert_eq!(
        checks
            .iter()
            .map(|check| check.id.as_str())
            .collect::<Vec<_>>(),
        ["java", "disk", "site", "updates", "memory"]
    );
    assert!(
        checks
            .iter()
            .find(|check| check.id == "updates")
            .unwrap()
            .ok
    );
    assert!(requests
        .iter()
        .any(|request| request.starts_with("GET /api/server/status ")));
    assert!(requests.iter().any(|request| request
        .starts_with("GET /releases/download/tauri-stable-feed/natux-tauri-control.json ")));
    assert!(requests.iter().any(|request| {
        request
            .starts_with("GET /releases/download/tauri-stable-feed/natux-tauri-control.json.sig ")
    }));
    assert!(requests.iter().any(|request| request
        .starts_with("GET /Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/latest.json ")));
    assert!(requests
        .iter()
        .all(|request| !request.contains("natux-update.json")));
}

#[test]
fn test_network_override_accepts_only_numeric_localhost() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let listener = TcpListener::bind("127.0.0.1:0").expect("local listener");
    let port = listener.local_addr().expect("listener address").port();
    drop(listener);

    assert!(DiagnosticsService::for_localhost_test(
        temporary.path().to_path_buf(),
        Url::parse(&format!("http://127.0.0.1:{port}/")).expect("localhost URL")
    )
    .is_some());
    assert!(DiagnosticsService::for_localhost_test(
        temporary.path().to_path_buf(),
        Url::parse(&format!("http://localhost:{port}/")).expect("localhost alias URL")
    )
    .is_none());
}

fn local_service(origin: Url) -> DiagnosticsService {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let path = temporary.path().to_path_buf();
    drop(temporary);
    DiagnosticsService::for_localhost_test(path, origin).expect("trusted local test origin")
}

fn local_server(response: Vec<u8>) -> (Url, thread::JoinHandle<()>) {
    let (origin, worker) = local_server_responses(vec![response]);
    let worker = thread::spawn(move || {
        let requests = worker.join().expect("local response completed");
        assert!(requests[0].contains("GET /api/server/status "));
    });
    (origin, worker)
}

fn local_server_responses(responses: Vec<Vec<u8>>) -> (Url, thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("local HTTP listener");
    let address = listener.local_addr().expect("listener address");
    let worker = thread::spawn(move || {
        let mut requests = Vec::with_capacity(responses.len());
        for response in responses {
            let (mut stream, _) = listener.accept().expect("HTTP client connected");
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(2)));
            let mut request = Vec::new();
            let mut buffer = [0; 256];
            while request.len() < 4096 && !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                let count = stream.read(&mut buffer).expect("read request headers");
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
            }
            requests.push(String::from_utf8_lossy(&request).into_owned());
            stream.write_all(&response).expect("write HTTP response");
        }
        requests
    });
    (
        Url::parse(&format!("http://{address}/")).expect("local server URL"),
        worker,
    )
}

fn local_server_routed(
    routes: impl IntoIterator<Item = (String, Vec<u8>)>,
    request_count: usize,
) -> (Url, thread::JoinHandle<Vec<String>>) {
    let routes = routes.into_iter().collect::<HashMap<_, _>>();
    let listener = TcpListener::bind("127.0.0.1:0").expect("local HTTP listener");
    listener
        .set_nonblocking(true)
        .expect("nonblocking local listener");
    let address = listener.local_addr().expect("listener address");
    let worker = thread::spawn(move || {
        let mut requests = Vec::with_capacity(request_count);
        for _ in 0..request_count {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            let (mut stream, _) = loop {
                match listener.accept() {
                    Ok(connection) => break connection,
                    Err(error)
                        if error.kind() == std::io::ErrorKind::WouldBlock
                            && std::time::Instant::now() < deadline =>
                    {
                        thread::sleep(std::time::Duration::from_millis(10));
                    }
                    Err(error) => panic!("HTTP client did not connect: {error}"),
                }
            };
            stream
                .set_nonblocking(false)
                .expect("blocking accepted stream");
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(2)));
            let mut request = Vec::new();
            let mut buffer = [0; 256];
            while request.len() < 4096 && !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                let count = stream.read(&mut buffer).expect("read request headers");
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
            }
            let request = String::from_utf8_lossy(&request).into_owned();
            let path = request
                .split_whitespace()
                .nth(1)
                .unwrap_or_default()
                .to_owned();
            let response = routes
                .get(&path)
                .cloned()
                .unwrap_or_else(|| http_response("404 Not Found", b"missing"));
            requests.push(request);
            stream.write_all(&response).expect("write HTTP response");
        }
        requests
    });
    (
        Url::parse(&format!("http://{address}/")).expect("local server URL"),
        worker,
    )
}

fn http_response(status: &str, body: &[u8]) -> Vec<u8> {
    format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes()
    .into_iter()
    .chain(body.iter().copied())
    .collect()
}
