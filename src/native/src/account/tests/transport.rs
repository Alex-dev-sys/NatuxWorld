use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

use serde_json::json;

use crate::account::transport::{
    ApiRequest, ApiTransport, HttpMethod, ReqwestTransport, TransportFailure, MAX_BODY_BYTES,
    REQUEST_TIMEOUT,
};

use super::run;

fn mock_http_server(
    status: &'static str,
    response_body: Vec<u8>,
    extra_headers: String,
    delay: Duration,
) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let worker = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let read = stream.read(&mut chunk).unwrap();
            if read == 0 {
                break;
            }
            request.extend_from_slice(&chunk[..read]);
            let Some(header_end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") else {
                continue;
            };
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            if request.len() >= header_end + 4 + content_length {
                break;
            }
        }
        if !delay.is_zero() {
            thread::sleep(delay);
        }
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{extra_headers}Connection: close\r\n\r\n",
            response_body.len()
        );
        let _ = stream.write_all(head.as_bytes());
        let _ = stream.write_all(&response_body);
        String::from_utf8_lossy(&request).into_owned()
    });
    (format!("http://{address}/api/auth"), worker)
}

#[test]
fn reqwest_transport_sends_expected_headers_and_bounds_both_bodies() {
    let (origin, worker) =
        mock_http_server("200 OK", b"{}".to_vec(), String::new(), Duration::ZERO);
    let transport = ReqwestTransport::new(origin).unwrap();
    let response = run(transport.send(ApiRequest {
        method: HttpMethod::Post,
        path: "/login",
        body: Some(json!({"login":"Natux","password":"password"})),
        token: Some("bearer-test-token".into()),
    }))
    .unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(response.body, b"{}");
    let request = worker.join().unwrap().to_ascii_lowercase();
    assert!(request.starts_with("post /api/auth/login http/1.1"));
    assert!(request.contains("user-agent: natuxworldlauncher"));
    assert!(request.contains("authorization: bearer bearer-test-token"));
    assert!(request.contains(r#"{"login":"natux","password":"password"}"#));

    let transport = ReqwestTransport::new("http://127.0.0.1:1/api/auth".to_owned()).unwrap();
    let oversized_request = ApiRequest {
        method: HttpMethod::Post,
        path: "/register",
        body: Some(json!({"large": "x".repeat(MAX_BODY_BYTES)})),
        token: None,
    };
    assert!(matches!(
        run(transport.send(oversized_request)),
        Err(TransportFailure::BodyTooLarge)
    ));

    let (origin, worker) = mock_http_server(
        "200 OK",
        vec![b'x'; MAX_BODY_BYTES + 1],
        String::new(),
        Duration::ZERO,
    );
    let transport = ReqwestTransport::new(origin).unwrap();
    assert!(matches!(
        run(transport.send(ApiRequest::get("/me", None))),
        Err(TransportFailure::BodyTooLarge)
    ));
    assert!(worker
        .join()
        .unwrap()
        .starts_with("GET /api/auth/me HTTP/1.1"));
}

#[test]
fn reqwest_transport_uses_six_second_timeout() {
    assert_eq!(REQUEST_TIMEOUT, Duration::from_secs(6));
    let (origin, worker) = mock_http_server(
        "200 OK",
        b"{}".to_vec(),
        String::new(),
        REQUEST_TIMEOUT + Duration::from_millis(500),
    );
    let transport = ReqwestTransport::new(origin).unwrap();
    let result = run(transport.send(ApiRequest::get("/me", None)));
    assert!(matches!(result, Err(TransportFailure::Timeout)));
    assert!(worker
        .join()
        .unwrap()
        .starts_with("GET /api/auth/me HTTP/1.1"));
}

#[test]
fn reqwest_transport_does_not_follow_redirects() {
    let redirect_target = TcpListener::bind("127.0.0.1:0").unwrap();
    redirect_target.set_nonblocking(true).unwrap();
    let target_address = redirect_target.local_addr().unwrap();
    let location = format!("Location: http://{target_address}/redirected\r\n");
    let (origin, worker) =
        mock_http_server("302 Found", b"redirect".to_vec(), location, Duration::ZERO);
    let transport = ReqwestTransport::new(origin).unwrap();
    let response = run(transport.send(ApiRequest::get("/me", None))).unwrap();
    assert_eq!(response.status, 302);
    assert_eq!(response.body, b"redirect");
    assert!(worker
        .join()
        .unwrap()
        .starts_with("GET /api/auth/me HTTP/1.1"));
    assert!(matches!(
        redirect_target.accept(),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock
    ));
}
