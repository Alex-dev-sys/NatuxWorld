use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread::{self, JoinHandle};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use reqwest::Url;
use serde_json::json;

use super::{trusted_update_url, UpdateDiagnostics, CONTROL_PATH, CONTROL_SIGNATURE_PATH};

const FEED_PATH: &str = "/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/latest.json";
const FEED_URL_PATH: &str = "/releases/download/v1.9.16/latest.json";
const TEST_KEY: [u8; 32] = [42; 32];

#[tokio::test]
async fn update_probe_checks_signed_tauri_control_then_its_feed() {
    let (control, signature) = signed_control("stable", FEED_URL_PATH);
    let feed = valid_feed("1.9.16");
    let (origin, server) = local_server(
        [
            (
                CONTROL_PATH.to_owned(),
                response("200 OK", control.as_bytes(), ""),
            ),
            (
                CONTROL_SIGNATURE_PATH.to_owned(),
                response("200 OK", signature.as_bytes(), ""),
            ),
            (
                FEED_PATH.to_owned(),
                response("200 OK", feed.as_bytes(), ""),
            ),
        ],
        3,
    );
    let service = UpdateDiagnostics::for_localhost_test(origin).expect("localhost update service");

    let check = service.run().await;
    let requests = server.join().expect("local responses completed");

    assert!(check.ok, "{:?}", check.detail);
    assert_eq!(check.id, "updates");
    assert_eq!(check.label, "Канал обновлений");
    assert!(check
        .detail
        .unwrap()
        .contains("Подписанный control и фид Tauri доступны"));
    assert_eq!(requests.len(), 3);
    assert!(requests
        .iter()
        .any(|request| request.starts_with(&format!("GET {CONTROL_PATH} "))));
    assert!(requests
        .iter()
        .any(|request| { request.starts_with(&format!("GET {CONTROL_SIGNATURE_PATH} ")) }));
    assert!(requests
        .iter()
        .any(|request| request.starts_with(&format!("GET {FEED_PATH} "))));
    assert!(requests
        .iter()
        .all(|request| !request.contains("natux-update.json")));
}

#[tokio::test]
async fn invalid_control_json_is_reported_without_requesting_the_feed() {
    let control = "not-json";
    let signature = sign(control);
    let (origin, server) = local_server(
        [
            (
                CONTROL_PATH.to_owned(),
                response("200 OK", control.as_bytes(), ""),
            ),
            (
                CONTROL_SIGNATURE_PATH.to_owned(),
                response("200 OK", signature.as_bytes(), ""),
            ),
        ],
        2,
    );
    let service = UpdateDiagnostics::for_localhost_test(origin).expect("localhost update service");

    let check = service.run().await;
    let requests = server.join().expect("control responses completed");

    assert!(!check.ok);
    assert!(check
        .detail
        .unwrap()
        .contains("Tauri update control is invalid JSON"));
    assert_eq!(requests.len(), 2);
    assert!(requests
        .iter()
        .all(|request| !request.contains("latest.json")));
}

#[tokio::test]
async fn invalid_control_signature_is_reported_without_requesting_the_feed() {
    let (control, _) = signed_control("stable", FEED_URL_PATH);
    let (origin, server) = local_server(
        [
            (
                CONTROL_PATH.to_owned(),
                response("200 OK", control.as_bytes(), ""),
            ),
            (
                CONTROL_SIGNATURE_PATH.to_owned(),
                response("200 OK", b"invalid-signature", ""),
            ),
        ],
        2,
    );
    let service = UpdateDiagnostics::for_localhost_test(origin).expect("localhost update service");

    let check = service.run().await;
    let requests = server.join().expect("control responses completed");

    assert!(!check.ok);
    assert!(check
        .detail
        .unwrap()
        .contains("Tauri update control signature"));
    assert_eq!(requests.len(), 2);
    assert!(requests
        .iter()
        .all(|request| !request.contains("latest.json")));
}

#[tokio::test]
async fn feed_http_failure_is_reported_after_control_verification() {
    let (control, signature) = signed_control("stable", FEED_URL_PATH);
    let (origin, server) = local_server(
        [
            (
                CONTROL_PATH.to_owned(),
                response("200 OK", control.as_bytes(), ""),
            ),
            (
                CONTROL_SIGNATURE_PATH.to_owned(),
                response("200 OK", signature.as_bytes(), ""),
            ),
            (
                FEED_PATH.to_owned(),
                response("503 Service Unavailable", b"offline", ""),
            ),
        ],
        3,
    );
    let service = UpdateDiagnostics::for_localhost_test(origin).expect("localhost update service");

    let check = service.run().await;
    let requests = server.join().expect("local responses completed");

    assert!(!check.ok);
    assert!(check.detail.unwrap().contains("Фид Tauri: HTTP 503"));
    assert_eq!(requests.len(), 3);
    assert!(requests
        .iter()
        .any(|request| request.starts_with(&format!("GET {FEED_PATH} "))));
}

#[tokio::test]
async fn feed_rejects_a_version_that_differs_from_the_signed_control() {
    let (control, signature) = signed_control("stable", FEED_URL_PATH);
    let feed = valid_feed("1.9.15");
    let (origin, server) = local_server(
        [
            (
                CONTROL_PATH.to_owned(),
                response("200 OK", control.as_bytes(), ""),
            ),
            (
                CONTROL_SIGNATURE_PATH.to_owned(),
                response("200 OK", signature.as_bytes(), ""),
            ),
            (
                FEED_PATH.to_owned(),
                response("200 OK", feed.as_bytes(), ""),
            ),
        ],
        3,
    );
    let service = UpdateDiagnostics::for_localhost_test(origin).expect("localhost update service");

    let check = service.run().await;
    let _ = server.join().expect("local responses completed");

    assert!(!check.ok);
    assert!(check
        .detail
        .unwrap()
        .contains("не совпадает с подписанным control"));
}

#[tokio::test]
async fn feed_probe_rejects_oversized_success_payloads() {
    let oversized = vec![b'x'; super::super::MAX_RESPONSE_BYTES + 1];
    let (origin, server) = local_server(
        [(FEED_PATH.to_owned(), response("200 OK", &oversized, ""))],
        1,
    );
    let service =
        UpdateDiagnostics::for_localhost_test(origin.clone()).expect("localhost update service");

    let result = service
        .probe_feed(
            origin.join(FEED_PATH.trim_start_matches('/')).unwrap(),
            "1.9.16",
        )
        .await;
    let _ = server.join().expect("local response completed");

    assert_eq!(result, Err(super::ProbeError::TooLarge));
}

#[tokio::test]
async fn update_redirect_is_stopped_before_an_untrusted_host_is_contacted() {
    let target = TcpListener::bind("127.0.0.1:0").expect("local redirect target");
    target.set_nonblocking(true).expect("nonblocking listener");
    let target_url = format!("http://{}/redirected", target.local_addr().unwrap());
    let (origin, server) = local_server(
        [(
            FEED_PATH.to_owned(),
            response("302 Found", b"", &format!("Location: {target_url}\r\n")),
        )],
        1,
    );
    let service =
        UpdateDiagnostics::for_localhost_test(origin.clone()).expect("localhost update service");

    let result = service
        .probe_feed(
            origin.join(FEED_PATH.trim_start_matches('/')).unwrap(),
            "1.9.16",
        )
        .await;
    let _ = server.join().expect("local response completed");

    assert!(matches!(result, Ok(ref probe) if probe.status.as_u16() == 302));
    assert!(matches!(
        target.accept(),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock
    ));
}

#[test]
fn updater_probe_trusts_only_github_and_githubusercontent_over_https() {
    assert!(trusted_update_url(
        &Url::parse("https://github.com/Alex-dev-sys/NatuxWorld/releases/download/tauri-stable-feed/natux-tauri-control.json")
            .unwrap(),
        None
    ));
    assert!(trusted_update_url(
        &Url::parse("https://release-assets.githubusercontent.com/file?token=opaque").unwrap(),
        None
    ));
    assert!(!trusted_update_url(
        &Url::parse("https://github.com.evil.example/natux-tauri-control.json").unwrap(),
        None
    ));
    assert!(!trusted_update_url(
        &Url::parse("http://github.com/natux-tauri-control.json").unwrap(),
        None
    ));
}

fn signed_control(channel: &str, local_feed_path: &str) -> (String, String) {
    let signing_key = SigningKey::from_bytes(&TEST_KEY);
    let raw = format!(
        "{{\"schemaVersion\":1,\"repository\":\"Alex-dev-sys/NatuxWorld\",\"channel\":\"{channel}\",\"version\":\"1.9.16\",\"rolloutPct\":100,\"feedUrl\":\"https://github.com/Alex-dev-sys/NatuxWorld{}\",\"migrationEnabled\":false}}",
        local_feed_path
    );
    let signature = STANDARD.encode(signing_key.sign(raw.as_bytes()).to_bytes());
    (raw, signature)
}

fn sign(raw: &str) -> String {
    STANDARD.encode(
        SigningKey::from_bytes(&TEST_KEY)
            .sign(raw.as_bytes())
            .to_bytes(),
    )
}

fn valid_feed(version: &str) -> String {
    json!({
        "version": version,
        "notes": "test",
        "pub_date": "2026-10-12T00:00:00Z",
        "platforms": {
            "windows-x86_64": {
                "signature": "test-signature",
                "url": "https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/NatuxWorld-1.9.16-x64-setup.exe"
            }
        }
    })
    .to_string()
}

fn local_server(
    routes: impl IntoIterator<Item = (String, Vec<u8>)>,
    request_count: usize,
) -> (Url, JoinHandle<Vec<String>>) {
    let routes = routes.into_iter().collect::<HashMap<_, _>>();
    let listener = TcpListener::bind("127.0.0.1:0").expect("local HTTP listener");
    listener
        .set_nonblocking(true)
        .expect("nonblocking local listener");
    let address = listener.local_addr().expect("listener address");
    let origin = Url::parse(&format!("http://{address}/")).expect("local server URL");
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
            let reply = routes
                .get(&path)
                .cloned()
                .unwrap_or_else(|| response("404 Not Found", b"missing", ""));
            requests.push(request);
            stream.write_all(&reply).expect("write HTTP response");
        }
        requests
    });
    (origin, worker)
}

fn response(status: &str, body: &[u8], extra_headers: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{extra_headers}Connection: close\r\n\r\n",
        body.len()
    )
    .into_bytes()
    .into_iter()
    .chain(body.iter().copied())
    .collect()
}
