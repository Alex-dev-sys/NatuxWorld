use std::time::Instant;

use reqwest::header::{ACCEPT, USER_AGENT};
use reqwest::{redirect::Policy, Client, StatusCode, Url};
use serde_json::Value;

use super::{DiagnosticCheck, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT};

#[cfg(test)]
const CONTROL_PATH: &str = "/releases/download/tauri-stable-feed/natux-tauri-control.json";
#[cfg(test)]
const CONTROL_SIGNATURE_PATH: &str =
    "/releases/download/tauri-stable-feed/natux-tauri-control.json.sig";
#[cfg(test)]
const TEST_CONTROL_KEY: [u8; 32] = [42; 32];

pub(super) struct UpdateDiagnostics {
    client: Client,
    test_origin: Option<Url>,
    #[cfg(test)]
    test_channel: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
struct FeedProbe {
    status: StatusCode,
    latency_ms: u64,
}

#[derive(Debug, PartialEq, Eq)]
enum ProbeError {
    Unavailable,
    TooLarge,
    InvalidFeed(&'static str),
}

impl UpdateDiagnostics {
    pub(super) fn new() -> Result<Self, reqwest::Error> {
        Self::build(None)
    }

    #[cfg(test)]
    pub(super) fn for_localhost_test(origin: Url) -> Option<Self> {
        if origin.scheme() != "http"
            || origin.host_str() != Some("127.0.0.1")
            || origin.port().is_none()
            || origin.path() != "/"
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
        {
            return None;
        }
        Self::build(Some(origin)).ok()
    }

    fn build(test_origin: Option<Url>) -> Result<Self, reqwest::Error> {
        let redirect_origin = test_origin.clone();
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .redirect(Policy::custom(move |attempt| {
                if attempt.previous().len() >= 5
                    || !trusted_update_url(attempt.url(), redirect_origin.as_ref())
                {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()?;
        Ok(Self {
            client,
            test_origin,
            #[cfg(test)]
            test_channel: Some("stable".to_owned()),
        })
    }

    pub(super) async fn run(&self) -> DiagnosticCheck {
        let channel = match self.current_channel() {
            Ok(channel) => channel,
            Err(detail) => return failed(&detail),
        };
        let control = self.fetch_control(&channel).await;
        let control = match control {
            Ok(control) => control,
            Err(error) => {
                return failed(&format!(
                    "Не удалось проверить подписанный Tauri control: {error}"
                ));
            }
        };
        let feed_url = match self.feed_endpoint(control.feed_url()) {
            Some(url) => url,
            None => return failed("Подписанный Tauri control содержит недоверенный URL фида"),
        };
        match self.probe_feed(feed_url, control.version()).await {
            Ok(probe) if probe.status.is_success() => DiagnosticCheck {
                id: "updates".to_owned(),
                label: "Канал обновлений".to_owned(),
                ok: true,
                detail: Some(format!(
                    "Подписанный control и фид Tauri доступны ({} мс)",
                    probe.latency_ms
                )),
            },
            Ok(probe) => failed(&format!("Фид Tauri: HTTP {}", probe.status.as_u16())),
            Err(ProbeError::Unavailable) => failed("Фид Tauri не отвечает"),
            Err(ProbeError::TooLarge) => failed("Фид Tauri превышает допустимый размер"),
            Err(ProbeError::InvalidFeed(message)) => failed(message),
        }
    }

    fn current_channel(&self) -> Result<String, String> {
        #[cfg(test)]
        if let Some(channel) = &self.test_channel {
            return Ok(channel.clone());
        }

        let store = crate::settings::SettingsStore::from_legacy_environment()
            .map_err(|_| "Не удалось прочитать канал обновлений из настроек".to_owned())?;
        store
            .get()
            .map(|settings| settings.update_channel)
            .map_err(|_| "Не удалось прочитать канал обновлений из настроек".to_owned())
    }

    async fn fetch_control(
        &self,
        channel: &str,
    ) -> Result<crate::updater::ControlManifest, String> {
        #[cfg(test)]
        if let Some(origin) = &self.test_origin {
            let test_public_key =
                ed25519_dalek::SigningKey::from_bytes(&TEST_CONTROL_KEY).verifying_key();
            return crate::updater::fetch_control_for_test(
                channel,
                origin,
                test_public_key.as_bytes(),
            )
            .await;
        }
        crate::updater::fetch_control(channel).await
    }

    fn feed_endpoint(&self, feed_url: &str) -> Option<Url> {
        let feed_url = Url::parse(feed_url).ok()?;
        if let Some(origin) = &self.test_origin {
            return origin.join(feed_url.path().trim_start_matches('/')).ok();
        }
        trusted_update_url(&feed_url, None).then_some(feed_url)
    }

    async fn probe_feed(
        &self,
        endpoint: Url,
        expected_version: &str,
    ) -> Result<FeedProbe, ProbeError> {
        if !trusted_update_url(&endpoint, self.test_origin.as_ref()) {
            return Err(ProbeError::Unavailable);
        }
        let started = Instant::now();
        let response = self
            .client
            .get(endpoint)
            .header(ACCEPT, "application/json")
            .header(USER_AGENT, "NatuxWorldLauncher")
            .send()
            .await
            .map_err(|_| ProbeError::Unavailable)?;
        if !trusted_update_url(response.url(), self.test_origin.as_ref()) {
            return Err(ProbeError::Unavailable);
        }
        let status = response.status();
        let mut body = Vec::new();
        if status.is_success() {
            if response
                .content_length()
                .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
            {
                return Err(ProbeError::TooLarge);
            }
            let mut response = response;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| ProbeError::Unavailable)?
            {
                if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                    return Err(ProbeError::TooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            validate_feed(&body, expected_version)?;
        }
        Ok(FeedProbe {
            status,
            latency_ms: started.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
        })
    }
}

fn validate_feed(raw: &[u8], expected_version: &str) -> Result<(), ProbeError> {
    let feed: Value = serde_json::from_slice(raw)
        .map_err(|_| ProbeError::InvalidFeed("Фид Tauri содержит некорректный JSON"))?;
    if feed.get("version").and_then(Value::as_str) != Some(expected_version) {
        return Err(ProbeError::InvalidFeed(
            "Версия фида Tauri не совпадает с подписанным control",
        ));
    }
    let Some(platforms) = feed.get("platforms").and_then(Value::as_object) else {
        return Err(ProbeError::InvalidFeed(
            "Фид Tauri не содержит платформенных пакетов",
        ));
    };
    if platforms.is_empty()
        || platforms.values().any(|platform| {
            let signature = platform.get("signature").and_then(Value::as_str);
            let asset_url = platform
                .get("url")
                .and_then(Value::as_str)
                .and_then(|url| Url::parse(url).ok());
            !signature.is_some_and(|value| {
                !value.trim().is_empty() && value.len() <= 4096 && !value.contains('\0')
            }) || !asset_url.is_some_and(|url| trusted_update_url(&url, None))
        })
    {
        return Err(ProbeError::InvalidFeed(
            "Фид Tauri не содержит доверенных пакетов с подписью",
        ));
    }
    Ok(())
}

fn failed(message: &str) -> DiagnosticCheck {
    DiagnosticCheck {
        id: "updates".to_owned(),
        label: "Канал обновлений".to_owned(),
        ok: false,
        detail: Some(format!("{message} — авто-обновления не сработают")),
    }
}

fn trusted_update_url(url: &Url, test_origin: Option<&Url>) -> bool {
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return false;
    }
    if let Some(origin) = test_origin {
        return url.scheme() == origin.scheme()
            && url.host_str() == origin.host_str()
            && url.port() == origin.port();
    }
    url.scheme() == "https"
        && url.host_str().is_some_and(|host| {
            host == "github.com"
                || host == "githubusercontent.com"
                || host.ends_with(".githubusercontent.com")
        })
}

#[cfg(test)]
#[path = "updates/tests.rs"]
mod tests;
