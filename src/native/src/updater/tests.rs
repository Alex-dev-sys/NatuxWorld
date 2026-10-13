use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use serde_json::json;
use url::Url;

use super::{error_event, read_bounded_response};

fn chunked_server(body: &'static [u8]) -> (Url, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let worker = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let count = stream.read(&mut buffer).unwrap();
            if count == 0 {
                return;
            }
            request.extend_from_slice(&buffer[..count]);
        }

        let response = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:X}\r\n",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.write_all(body);
        let _ = stream.write_all(b"\r\n0\r\n\r\n");
    });
    (
        Url::parse(&format!("http://{address}/control")).unwrap(),
        worker,
    )
}

#[tokio::test]
async fn bounded_control_body_accepts_chunked_body_at_limit() {
    let (url, worker) = chunked_server(b"12345678");
    let response = reqwest::Client::new().get(url).send().await.unwrap();

    assert_eq!(response.content_length(), None);
    assert_eq!(
        read_bounded_response(response, 8).await.unwrap(),
        b"12345678"
    );
    worker.join().unwrap();
}

#[tokio::test]
async fn bounded_control_body_rejects_chunked_body_over_limit() {
    let (url, worker) = chunked_server(b"123456789");
    let response = reqwest::Client::new().get(url).send().await.unwrap();

    assert_eq!(response.content_length(), None);
    assert_eq!(
        read_bounded_response(response, 8).await.unwrap_err(),
        "Tauri update control is too large"
    );
    worker.join().unwrap();
}

#[test]
fn updater_failures_use_the_shared_frontend_event_shape() {
    assert_eq!(
        error_event("network unavailable"),
        json!({ "type": "error", "message": "network unavailable" })
    );
}
