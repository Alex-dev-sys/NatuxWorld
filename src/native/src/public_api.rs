//! Fixed-origin public website API for the launcher renderer.
//!
//! News uses a five-minute in-memory cache. On a failed, invalid, or empty
//! refresh it returns the last cached list, or a bundled welcome item when no
//! cache exists. Server status and info fall back to the same offline values
//! as the Electron services. Production requests always target vibestudy.ru
//! over HTTPS; the localhost origin constructor exists only in unit tests.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use reqwest::header::{ACCEPT, USER_AGENT};
use reqwest::{redirect::Policy, Client, StatusCode, Url};
use serde::Serialize;
use serde_json::Value;

const SITE_ORIGIN: &str = "https://vibestudy.ru";
const SITE_HOST: &str = "vibestudy.ru";
const SERVER_HOST: &str = "mc.vibestudy.ru";
const NEWS_PATH: &str = "/api/news";
const SERVER_STATUS_PATH: &str = "/api/server/status";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
const NEWS_BODY_LIMIT: usize = 512 * 1024;
const SERVER_BODY_LIMIT: usize = 1024 * 1024;
const NEWS_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_NEWS_ITEMS: usize = 20;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub image: String,
    pub date: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub online: bool,
    pub players: u64,
    pub max_players: u64,
    pub ping: u64,
    pub tps: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub ip: String,
    pub version: String,
    pub mode: String,
    pub map: String,
    pub difficulty: String,
    pub whitelist: bool,
    pub tps: f64,
    pub ping: u64,
}

struct NewsCache {
    items: Vec<NewsItem>,
    fetched_at: Instant,
}

struct ServerPayload {
    online: Option<bool>,
    players: Option<u64>,
    max_players: Option<u64>,
    version: Option<String>,
    tps: Option<f64>,
}

pub struct PublicApiService {
    client: Client,
    base_url: Url,
    news_cache: Mutex<Option<NewsCache>>,
    #[cfg(test)]
    allow_localhost_test: bool,
}

impl PublicApiService {
    pub fn new() -> Result<Self, reqwest::Error> {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()?;
        let base_url = Url::parse(SITE_ORIGIN).expect("trusted website origin is valid");
        Ok(Self {
            client,
            base_url,
            news_cache: Mutex::new(None),
            #[cfg(test)]
            allow_localhost_test: false,
        })
    }

    fn news_cache_lock(&self) -> MutexGuard<'_, Option<NewsCache>> {
        self.news_cache
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    /// Return fresh news when possible, then stale cache, then bundled content.
    pub async fn get_all_news(&self) -> Vec<NewsItem> {
        if let Some(cache) = self.news_cache_lock().as_ref() {
            if cache.fetched_at.elapsed() < NEWS_CACHE_TTL {
                return cache.items.clone();
            }
        }

        if let Some(items) = self.fetch_news().await {
            *self.news_cache_lock() = Some(NewsCache {
                items: items.clone(),
                fetched_at: Instant::now(),
            });
            return items;
        }

        self.news_cache_lock()
            .as_ref()
            .map(|cache| cache.items.clone())
            .unwrap_or_else(fallback_news)
    }

    /// Return the Electron-compatible offline DTO when the public API fails.
    pub async fn get_server_status(&self) -> ServerStatus {
        let started = Instant::now();
        match self.fetch_server_payload().await {
            Ok(data) => ServerStatus {
                online: data.online.unwrap_or(false),
                players: data.players.unwrap_or(0),
                max_players: data.max_players.unwrap_or(100),
                ping: elapsed_ms(started),
                tps: data.tps.unwrap_or(20.0),
            },
            Err(()) => ServerStatus {
                online: false,
                players: 0,
                max_players: 100,
                ping: 0,
                tps: 0.0,
            },
        }
    }

    /// Return static server details and use the Electron offline defaults on failure.
    pub async fn get_server_info(&self) -> ServerInfo {
        let started = Instant::now();
        match self.fetch_server_payload().await {
            Ok(data) => ServerInfo {
                ip: SERVER_HOST.to_owned(),
                version: data
                    .version
                    .filter(|version| !version.is_empty())
                    .unwrap_or_else(|| "1.20.1+".to_owned()),
                mode: "Анархия · PvP · Выживание".to_owned(),
                map: "world_anarchy".to_owned(),
                difficulty: "Hard".to_owned(),
                whitelist: false,
                tps: data.tps.unwrap_or(20.0),
                ping: elapsed_ms(started),
            },
            Err(()) => ServerInfo {
                ip: SERVER_HOST.to_owned(),
                version: "1.20.1+".to_owned(),
                mode: "Анархия · PvP · Выживание".to_owned(),
                map: "world_anarchy".to_owned(),
                difficulty: "Hard".to_owned(),
                whitelist: false,
                tps: 0.0,
                ping: 0,
            },
        }
    }

    async fn fetch_news(&self) -> Option<Vec<NewsItem>> {
        let value = self.get_json(NEWS_PATH, NEWS_BODY_LIMIT).await.ok()?;
        let raw_items = value.as_array()?;
        let items: Vec<_> = raw_items
            .iter()
            .take(MAX_NEWS_ITEMS)
            .filter_map(sanitize_news_item)
            .collect();
        (!items.is_empty()).then_some(items)
    }

    async fn fetch_server_payload(&self) -> Result<ServerPayload, ()> {
        let value = self.get_json(SERVER_STATUS_PATH, SERVER_BODY_LIMIT).await?;
        parse_server_payload(&value).ok_or(())
    }

    async fn get_json(&self, path: &str, max_body_bytes: usize) -> Result<Value, ()> {
        let url = self.endpoint(path).ok_or(())?;
        let mut response = self
            .client
            .get(url)
            .header(ACCEPT, "application/json")
            .header(USER_AGENT, "NatuxWorldLauncher")
            .send()
            .await
            .map_err(|_| ())?;
        if !self.url_is_trusted(response.url()) || response.status() != StatusCode::OK {
            return Err(());
        }
        if response
            .content_length()
            .is_some_and(|length| length > max_body_bytes as u64)
        {
            return Err(());
        }

        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
            if body.len().saturating_add(chunk.len()) > max_body_bytes {
                return Err(());
            }
            body.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&body).map_err(|_| ())
    }

    fn endpoint(&self, path: &str) -> Option<Url> {
        if !matches!(path, NEWS_PATH | SERVER_STATUS_PATH) {
            return None;
        }
        let url = self.base_url.join(path).ok()?;
        self.url_is_trusted(&url).then_some(url)
    }

    fn url_is_trusted(&self, url: &Url) -> bool {
        if !url.username().is_empty() || url.password().is_some() || url.query().is_some() {
            return false;
        }
        if url.fragment().is_some() {
            return false;
        }
        #[cfg(test)]
        if self.allow_localhost_test {
            return is_localhost_test_url(url) && url.port() == self.base_url.port();
        }
        url.scheme() == "https"
            && url.host_str() == Some(SITE_HOST)
            && url.port().is_none_or(|port| port == 443)
    }

    #[cfg(test)]
    fn for_localhost_test(origin: Url) -> Option<Self> {
        if !is_localhost_test_url(&origin) || origin.path() != "/" {
            return None;
        }
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()
            .ok()?;
        Some(Self {
            client,
            base_url: origin,
            news_cache: Mutex::new(None),
            allow_localhost_test: true,
        })
    }
}

#[cfg(test)]
fn is_localhost_test_url(url: &Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}

fn fallback_news() -> Vec<NewsItem> {
    vec![NewsItem {
        id: "welcome".to_owned(),
        title: "Добро пожаловать!".to_owned(),
        description: "Лаунчер установлен и готов к игре.".to_owned(),
        body: "Нажмите ИГРАТЬ — лаунчер сам скачает Java и все файлы. Новости с сервера подгружаются отсюда автоматически.".to_owned(),
        image: "/news/welcome.jpg".to_owned(),
        date: String::new(),
        category: "update".to_owned(),
    }]
}

fn sanitize_news_item(value: &Value) -> Option<NewsItem> {
    let raw = value.as_object()?;
    let id = bounded_string(raw.get("id"), 80);
    let title = bounded_string(raw.get("title"), 200);
    if id.is_empty() || title.is_empty() {
        return None;
    }
    let raw_category = bounded_string(raw.get("category"), 20);
    let category = match raw_category.as_str() {
        "event" | "donate" | "wipe" => raw_category,
        _ => "update".to_owned(),
    };
    Some(NewsItem {
        id,
        title,
        description: bounded_string(raw.get("description"), 300),
        body: bounded_string(raw.get("body"), 2000),
        image: bounded_string(raw.get("image"), 300),
        date: bounded_string(raw.get("date"), 60),
        category,
    })
}

fn bounded_string(value: Option<&Value>, max_chars: usize) -> String {
    value
        .and_then(Value::as_str)
        .map(|value| value.chars().take(max_chars).collect())
        .unwrap_or_default()
}

fn parse_server_payload(value: &Value) -> Option<ServerPayload> {
    let raw = value.as_object()?;
    let players = raw.get("players").and_then(Value::as_object);
    let tps = raw
        .get("tps")
        .and_then(Value::as_f64)
        .filter(|tps| tps.is_finite() && (0.0..=20.0).contains(tps));
    let version = bounded_string(raw.get("version"), 128);
    Some(ServerPayload {
        online: raw.get("online").and_then(Value::as_bool),
        players: players
            .and_then(|players| players.get("online"))
            .and_then(Value::as_u64),
        max_players: players
            .and_then(|players| players.get("max"))
            .and_then(Value::as_u64),
        version: (!version.is_empty()).then_some(version),
        tps,
    })
}

#[cfg(test)]
mod tests;
