use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

mod control_signature;
mod integrity;
mod manifest;
mod policy;

pub(crate) use manifest::ControlManifest;
use manifest::{control_is_visible, validate_control, verify_control};
use policy::{manual_release_url, UpdateMode};

use crate::settings::SettingsStore;

use manifest::{CONTROL_MAX_BYTES, REPOSITORY, SIGNATURE_MAX_BYTES};

const UPDATE_TIMEOUT: Duration = Duration::from_secs(30);
const UPDATE_EVENT: &str = "updater:event";
const TAURI_UPDATER_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFGRTVCMTRBNUQwNEZGRDAKUldUUS93UmRTckhsSDNGMWxTakU4cXhqc0RaR091dm9ubGNoRnc4SExXU0MrR24vOHhYcUNGRWwK";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl UpdateInfo {
    fn current() -> Self {
        Self {
            available: false,
            version: None,
            notes: None,
            url: None,
            error: None,
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self {
            error: Some(message.into()),
            ..Self::current()
        }
    }
}

struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

pub struct UpdaterState {
    pending: Mutex<Option<DownloadedUpdate>>,
    operation: tokio::sync::Mutex<()>,
    background_started: AtomicBool,
    integrity_started: AtomicBool,
}

impl Default for UpdaterState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(None),
            operation: tokio::sync::Mutex::new(()),
            background_started: AtomicBool::new(false),
            integrity_started: AtomicBool::new(false),
        }
    }
}

#[tauri::command]
pub async fn updater_check(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    updater: State<'_, UpdaterState>,
) -> Result<UpdateInfo, String> {
    let result = check_update(&app, settings.inner(), updater.inner()).await;
    match result {
        Ok(info) => Ok(info),
        Err(message) => {
            emit_error(&app, message.clone());
            Ok(UpdateInfo::failed(message))
        }
    }
}

#[tauri::command]
pub async fn updater_install(
    app: AppHandle,
    updater: State<'_, UpdaterState>,
) -> Result<(), String> {
    let _operation = updater.operation.lock().await;
    // Re-evaluate the on-disk portable marker at install time as well as check
    // time. A pending NSIS must never convert a portable copy to an installed one.
    if policy::current_update_mode()? != UpdateMode::Automatic {
        clear_pending(updater.inner())?;
        emit_error(
            &app,
            "This distribution requires a manual update from its versioned release",
        );
        return Ok(());
    }
    let pending = updater
        .pending
        .lock()
        .map_err(|_| "updater state is unavailable".to_owned())?
        .take();
    let Some(pending) = pending else {
        emit_error(&app, "No verified update is ready to install");
        return Ok(());
    };

    if let Err(error) = pending.update.install(pending.bytes) {
        let message = error.to_string();
        emit_error(&app, message);
        return Ok(());
    }

    app.restart();
}

pub fn schedule_background_checks(app: &AppHandle, settings: &SettingsStore) {
    if !policy::current_update_mode().is_ok_and(|mode| mode != UpdateMode::Unsupported)
        || !updates_enabled()
    {
        return;
    }
    integrity::schedule(app);
    if !settings.get().is_ok_and(|settings| settings.auto_update) {
        return;
    }

    let state = app.state::<UpdaterState>();
    if state.background_started.swap(true, Ordering::AcqRel) {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(4)).await;
        loop {
            let settings = app.state::<SettingsStore>();
            let updater = app.state::<UpdaterState>();
            if let Err(message) = check_update(&app, settings.inner(), updater.inner()).await {
                emit_error(&app, message);
            }
            tokio::time::sleep(Duration::from_secs(30 * 60)).await;
        }
    });
}

async fn check_update(
    app: &AppHandle,
    settings: &SettingsStore,
    updater: &UpdaterState,
) -> Result<UpdateInfo, String> {
    let mode = policy::current_update_mode()?;
    if mode == UpdateMode::Unsupported {
        return Err("Tauri updates are not available for Linux builds yet".to_owned());
    }

    let _operation = updater.operation.lock().await;
    clear_pending(updater)?;
    emit(app, json!({ "type": "checking" }));

    if !updates_enabled() {
        return Err("Tauri update signing is not enabled for this build".to_owned());
    }

    let settings = settings.get()?;
    let current_version = app.package_info().version.to_string();
    let control = fetch_control(&settings.update_channel).await?;
    if !control_is_visible(&control, &settings, &current_version)? {
        emit(
            app,
            json!({ "type": "not-available", "version": current_version }),
        );
        return Ok(UpdateInfo::current());
    }

    let endpoint =
        Url::parse(&control.feed_url).map_err(|_| "Invalid Tauri update feed URL".to_owned())?;
    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .pubkey(TAURI_UPDATER_PUBLIC_KEY)
        .timeout(UPDATE_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    let Some(update) = update else {
        emit(
            app,
            json!({ "type": "not-available", "version": current_version }),
        );
        return Ok(UpdateInfo::current());
    };
    if update.version != control.version {
        return Err(
            "Tauri update feed version does not match its signed control manifest".to_owned(),
        );
    }

    let version = update.version.clone();
    let notes = update.body.clone();
    if mode == UpdateMode::Manual {
        let url = manual_release_url(&version);
        let info = UpdateInfo {
            available: true,
            version: Some(version.clone()),
            notes: notes.clone(),
            url: Some(url.clone()),
            error: None,
        };
        let mut event = json!({ "type": "manual", "version": version, "url": url });
        if let Some(notes) = notes {
            event["notes"] = json!(notes);
        }
        emit(app, event);
        return Ok(info);
    }

    let url = update.download_url.to_string();
    emit(
        app,
        json!({ "type": "available", "version": version, "notes": notes }),
    );
    let bytes = download_verified(app, &update).await?;
    *updater
        .pending
        .lock()
        .map_err(|_| "updater state is unavailable".to_owned())? =
        Some(DownloadedUpdate { update, bytes });
    emit(app, json!({ "type": "downloaded", "version": version }));

    Ok(UpdateInfo {
        available: true,
        version: Some(version),
        notes,
        url: Some(url),
        error: None,
    })
}

async fn download_verified(app: &AppHandle, update: &Update) -> Result<Vec<u8>, String> {
    let mut transferred = 0_u64;
    let mut total = None;
    let mut last_emit = Instant::now();
    let bytes = update
        .download(
            |chunk_length, content_length| {
                transferred = transferred.saturating_add(chunk_length as u64);
                total = content_length.or(total);
                if last_emit.elapsed() >= Duration::from_millis(100)
                    || total.is_some_and(|length| transferred >= length)
                {
                    let percent = total
                        .filter(|length| *length > 0)
                        .map(|length| {
                            ((transferred as f64 / length as f64) * 100.0)
                                .round()
                                .clamp(0.0, 100.0)
                        })
                        .unwrap_or(0.0);
                    emit(
                        app,
                        json!({
                            "type": "progress",
                            "percent": percent,
                            "bytesPerSecond": 0,
                            "transferred": transferred,
                            "total": total.unwrap_or(0),
                        }),
                    );
                    last_emit = Instant::now();
                }
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn clear_pending(updater: &UpdaterState) -> Result<(), String> {
    *updater
        .pending
        .lock()
        .map_err(|_| "updater state is unavailable".to_owned())? = None;
    Ok(())
}

fn emit(app: &AppHandle, event: Value) {
    let _ = app.emit(UPDATE_EVENT, event);
}

fn updates_enabled() -> bool {
    matches!(option_env!("NATUX_TAURI_UPDATES_ENABLED"), Some("1"))
}

pub(crate) async fn fetch_control(channel: &str) -> Result<ControlManifest, String> {
    fetch_control_with_source(channel, None, None).await
}

#[cfg(test)]
pub(crate) async fn fetch_control_for_test(
    channel: &str,
    test_origin: &Url,
    public_key: &[u8; 32],
) -> Result<ControlManifest, String> {
    fetch_control_with_source(channel, Some(test_origin), Some(public_key)).await
}

async fn fetch_control_with_source(
    channel: &str,
    test_origin: Option<&Url>,
    test_public_key: Option<&[u8; 32]>,
) -> Result<ControlManifest, String> {
    if channel != "stable" && channel != "beta" {
        return Err("Unsupported Tauri update channel".to_owned());
    }
    let base = if let Some(origin) = test_origin {
        origin
            .join(&format!(
                "releases/download/tauri-{channel}-feed/natux-tauri-control.json"
            ))
            .map_err(|_| "Invalid Tauri update control URL".to_owned())?
    } else {
        Url::parse(&format!("https://github.com/{REPOSITORY}/releases/download/tauri-{channel}-feed/natux-tauri-control.json"))
            .map_err(|_| "Invalid Tauri update control URL".to_owned())?
    };
    let signature_url = Url::parse(&format!("{base}.sig"))
        .map_err(|_| "Invalid Tauri update control signature URL".to_owned())?;
    let raw = fetch_small_text(&base, CONTROL_MAX_BYTES, test_origin).await?;
    let signature = fetch_small_text(&signature_url, SIGNATURE_MAX_BYTES, test_origin).await?;
    let control = if let Some(public_key) = test_public_key {
        manifest::verify_control_with_key(&raw, signature.trim(), public_key)?;
        serde_json::from_str(&raw).map_err(|_| "Tauri update control is invalid JSON".to_owned())?
    } else {
        verify_control(&raw, signature.trim())?
    };
    validate_control(&control, channel)?;
    Ok(control)
}

async fn fetch_small_text(
    url: &Url,
    max_bytes: usize,
    test_origin: Option<&Url>,
) -> Result<String, String> {
    if !trusted_control_url(url, test_origin) {
        return Err("Tauri update control uses an untrusted URL".to_owned());
    }
    let redirect_origin = test_origin.cloned();
    let client = reqwest::Client::builder()
        .timeout(UPDATE_TIMEOUT)
        .user_agent("NatuxWorld-Tauri-Updater")
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 5
                || !trusted_control_url(attempt.url(), redirect_origin.as_ref())
            {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Tauri update control returned HTTP {}",
            response.status()
        ));
    }
    let final_url = response.url();
    if !trusted_control_url(final_url, test_origin) {
        return Err("Tauri update control redirected to an untrusted host".to_owned());
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("Tauri update control is too large".to_owned());
    }
    let bytes = read_bounded_response(response, max_bytes).await?;
    String::from_utf8(bytes).map_err(|_| "Tauri update control is not UTF-8".to_owned())
}

async fn read_bounded_response(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let capacity = response
        .content_length()
        .map_or(0, |length| length.min(max_bytes as u64) as usize);
    let mut bytes = Vec::with_capacity(capacity);
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        let next_length = bytes
            .len()
            .checked_add(chunk.len())
            .ok_or_else(|| "Tauri update control is too large".to_owned())?;
        if next_length > max_bytes {
            return Err("Tauri update control is too large".to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn emit_error(app: &AppHandle, message: impl Into<String>) {
    emit(app, error_event(message));
}

fn error_event(message: impl Into<String>) -> Value {
    json!({ "type": "error", "message": message.into() })
}

fn trusted_control_url(url: &Url, test_origin: Option<&Url>) -> bool {
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
#[path = "updater/tests.rs"]
mod tests;
