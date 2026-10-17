use std::future::Future;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use reqwest::Url;
use serde_json::json;

use super::{
    NewsCache, PublicApiService, ServerInfo, ServerStatus, MAX_NEWS_ITEMS, NEWS_BODY_LIMIT,
    NEWS_CACHE_TTL, SERVER_BODY_LIMIT,
};

fn run<F: Future>(future: F) -> F::Output {
    tauri::async_runtime::block_on(future)
}

fn mock_server(
    status: &'static str,
    body: Vec<u8>,
    extra_headers: String,
    delay: Duration,
    request_count: usize,
) -> (Url, JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let origin = Url::parse(&format!("http://{address}/")).unwrap();
    let worker = thread::spawn(move || {
        let mut requests = Vec::with_capacity(request_count);
        for _ in 0..request_count {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut chunk = [0_u8; 4096];
            loop {
                let read = stream.read(&mut chunk).unwrap();
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            requests.push(String::from_utf8_lossy(&request).into_owned());
            if !delay.is_zero() {
                thread::sleep(delay);
            }
            let head = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra_headers}Connection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&body);
        }
        requests
    });
    (origin, worker)
}

fn public_service(origin: Url) -> PublicApiService {
    PublicApiService::for_localhost_test(origin).expect("localhost mock origin")
}

#[test]
fn build_origin_and_server_host_match_the_shared_brand_without_expanding_trust() {
    let service = PublicApiService::new().unwrap();
    assert!(service.endpoint("/api/news").is_some());
    let endpoint = Url::parse(&format!("{}/api/news", crate::brand::site_origin())).unwrap();
    assert!(service.url_is_trusted(&endpoint));
    let mut different_port = endpoint.clone();
    different_port.set_port(Some(9999)).unwrap();
    assert!(!service.url_is_trusted(&different_port));
    assert!(!service.url_is_trusted(&Url::parse("https://evil.example/api/news").unwrap()));
    assert!(service.endpoint("https://evil.example/steal").is_none());
    assert_eq!(
        service.base_url.as_str().trim_end_matches('/'),
        crate::brand::site_origin()
    );
}

#[test]
fn localhost_mock_constructor_rejects_non_loopback_origins() {
    assert!(
        PublicApiService::for_localhost_test(Url::parse("http://127.0.0.1:3000/").unwrap())
            .is_some()
    );
    assert!(
        PublicApiService::for_localhost_test(Url::parse("http://example.com:3000/").unwrap())
            .is_none()
    );
    assert!(
        PublicApiService::for_localhost_test(Url::parse("https://127.0.0.1:3000/").unwrap())
            .is_none()
    );
}

#[test]
fn news_maps_renderer_dto_sanitizes_items_and_uses_five_minute_cache() {
    let body = json!([
        {
            "id":"n-1",
            "title":"Обновление",
            "description":"Описание",
            "body":"Текст",
            "image":"/news/a.png",
            "date":"2026-10-11",
            "category":"event"
        },
        {"id":"", "title":"Без id"},
        {"id":"n-2", "title":"Категория", "category":"unsupported"}
    ])
    .to_string()
    .into_bytes();
    let (origin, worker) = mock_server("200 OK", body, String::new(), Duration::ZERO, 1);
    let service = public_service(origin);

    let items = run(service.get_all_news());
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].id, "n-1");
    assert_eq!(items[0].category, "event");
    assert_eq!(items[1].category, "update");
    assert_eq!(run(service.get_all_news()), items);

    let requests = worker.join().unwrap();
    assert_eq!(requests.len(), 1);
    let request = requests[0].to_ascii_lowercase();
    assert!(request.starts_with("get /api/news http/1.1"));
    assert!(request.contains("accept: application/json"));
    assert!(request.contains("user-agent: natuxworldlauncher"));
    assert_eq!(NEWS_CACHE_TTL, Duration::from_secs(300));
    assert_eq!(MAX_NEWS_ITEMS, 20);
}

#[test]
fn news_truncates_fields_and_uses_bundled_fallback_for_empty_payload() {
    let long_title = "T".repeat(250);
    let body = json!([{
        "id":"n-long",
        "title":long_title,
        "description":"d".repeat(350),
        "body":"b".repeat(2100),
        "image":"i".repeat(320),
        "date":"x".repeat(70),
        "category":"wipe"
    }])
    .to_string()
    .into_bytes();
    let (origin, worker) = mock_server("200 OK", body, String::new(), Duration::ZERO, 1);
    let items = run(public_service(origin).get_all_news());
    assert_eq!(items[0].title.chars().count(), 200);
    assert_eq!(items[0].description.chars().count(), 300);
    assert_eq!(items[0].body.chars().count(), 2000);
    assert_eq!(items[0].image.chars().count(), 300);
    assert_eq!(items[0].date.chars().count(), 60);
    worker.join().unwrap();

    let (origin, worker) = mock_server("200 OK", b"[]".to_vec(), String::new(), Duration::ZERO, 1);
    let fallback = run(public_service(origin).get_all_news());
    assert_eq!(fallback.len(), 1);
    assert_eq!(fallback[0].id, "welcome");
    worker.join().unwrap();
}

#[test]
fn news_uses_stale_cache_when_refresh_fails() {
    let (origin, worker) = mock_server(
        "503 Service Unavailable",
        b"{}".to_vec(),
        String::new(),
        Duration::ZERO,
        1,
    );
    let service = public_service(origin);
    let cached = super::NewsItem {
        id: "cached".to_owned(),
        title: "Старая новость".to_owned(),
        description: String::new(),
        body: String::new(),
        image: String::new(),
        date: String::new(),
        category: "update".to_owned(),
    };
    *service.news_cache_lock() = Some(NewsCache {
        items: vec![cached.clone()],
        fetched_at: Instant::now() - NEWS_CACHE_TTL - Duration::from_secs(1),
    });
    assert_eq!(run(service.get_all_news()), vec![cached]);
    worker.join().unwrap();
}

#[test]
fn server_status_and_info_match_renderer_dtos() {
    let body = json!({
        "online":true,
        "players":{"online":12,"max":80},
        "version":"1.21.1",
        "tps":19.5
    })
    .to_string()
    .into_bytes();
    let (origin, worker) = mock_server("200 OK", body, String::new(), Duration::ZERO, 2);
    let service = public_service(origin);

    let status = run(service.get_server_status());
    assert_eq!(
        status,
        ServerStatus {
            online: true,
            players: 12,
            max_players: 80,
            ping: status.ping,
            tps: 19.5,
        }
    );
    let info = run(service.get_server_info());
    assert_eq!(
        info,
        ServerInfo {
            ip: crate::brand::server_host().to_owned(),
            version: "1.21.1".to_owned(),
            mode: "Анархия · PvP · Выживание".to_owned(),
            map: "world_anarchy".to_owned(),
            difficulty: "Hard".to_owned(),
            whitelist: false,
            tps: 19.5,
            ping: info.ping,
        }
    );
    let requests = worker.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests
        .iter()
        .all(|request| request.starts_with("GET /api/server/status HTTP/1.1")));
}

#[test]
fn server_services_use_documented_offline_defaults_on_http_failure() {
    let (origin, worker) = mock_server(
        "503 Service Unavailable",
        b"{}".to_vec(),
        String::new(),
        Duration::ZERO,
        2,
    );
    let service = public_service(origin);
    assert_eq!(
        run(service.get_server_status()),
        ServerStatus {
            online: false,
            players: 0,
            max_players: 100,
            ping: 0,
            tps: 0.0,
        }
    );
    assert_eq!(
        run(service.get_server_info()),
        ServerInfo {
            ip: crate::brand::server_host().to_owned(),
            version: "1.20.1+".to_owned(),
            mode: "Анархия · PvP · Выживание".to_owned(),
            map: "world_anarchy".to_owned(),
            difficulty: "Hard".to_owned(),
            whitelist: false,
            tps: 0.0,
            ping: 0,
        }
    );
    worker.join().unwrap();
}

#[test]
fn oversized_news_and_server_responses_use_fallbacks() {
    let oversized_news = json!({"body":"x".repeat(NEWS_BODY_LIMIT)}).to_string();
    let (origin, worker) = mock_server(
        "200 OK",
        oversized_news.into_bytes(),
        String::new(),
        Duration::ZERO,
        1,
    );
    let items = run(public_service(origin).get_all_news());
    assert_eq!(items[0].id, "welcome");
    worker.join().unwrap();

    let oversized_status = json!({"body":"x".repeat(SERVER_BODY_LIMIT)}).to_string();
    let (origin, worker) = mock_server(
        "200 OK",
        oversized_status.into_bytes(),
        String::new(),
        Duration::ZERO,
        1,
    );
    assert_eq!(
        run(public_service(origin).get_server_status()),
        ServerStatus {
            online: false,
            players: 0,
            max_players: 100,
            ping: 0,
            tps: 0.0,
        }
    );
    worker.join().unwrap();
}

#[test]
fn timeout_and_redirects_never_escape_the_trusted_host() {
    let (origin, worker) = mock_server(
        "200 OK",
        br#"{"online":true}"#.to_vec(),
        String::new(),
        super::REQUEST_TIMEOUT + Duration::from_millis(500),
        1,
    );
    assert_eq!(
        run(public_service(origin).get_server_status()),
        ServerStatus {
            online: false,
            players: 0,
            max_players: 100,
            ping: 0,
            tps: 0.0,
        }
    );
    worker.join().unwrap();

    let redirect_target = TcpListener::bind("127.0.0.1:0").unwrap();
    redirect_target.set_nonblocking(true).unwrap();
    let target = redirect_target.local_addr().unwrap();
    let (origin, worker) = mock_server(
        "302 Found",
        b"{}".to_vec(),
        format!("Location: http://{target}/redirected\r\n"),
        Duration::ZERO,
        1,
    );
    let status = run(public_service(origin).get_server_status());
    assert!(!status.online);
    assert_eq!(status.ping, 0);
    worker.join().unwrap();
    assert!(matches!(
        redirect_target.accept(),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock
    ));
}
