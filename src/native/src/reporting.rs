//! Opt-in reports use shared build-time brand routes and never carry credentials.
//! Crash data is redacted; telemetry contains only aggregate event fields.

use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, to_vec};

mod environment;

use crate::settings::{LauncherSettings, SettingsStore};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
// The existing crash-report route accepts at most 1 MiB. Leave room below that
// server limit so JSON escaping and UTF-8 never produce an oversized request.
const MAX_CRASH_BODY_BYTES: usize = 900 * 1024;
const MAX_TELEMETRY_BODY_BYTES: usize = 1024;
const MAX_STAGE_BYTES: usize = 100;
const MAX_MESSAGE_BYTES: usize = 2_000;
const MAX_LOG_LINES: usize = 300;
const MAX_LOG_LINE_BYTES: usize = 2_000;
const MAX_RAW_TEXT_BYTES: usize = 8_000;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CrashKind {
    LaunchError,
    GameCrash,
}

/// Username is accepted only as a redaction hint; it is never serialized.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CrashReport {
    pub kind: CrashKind,
    pub stage: String,
    pub message: String,
    pub exit_code: Option<i32>,
    pub logs: Vec<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TelemetryEvent {
    InstallOk,
    InstallFail,
    LaunchOk,
    GameCrash,
}

impl TelemetryEvent {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InstallOk => "install_ok",
            Self::InstallFail => "install_fail",
            Self::LaunchOk => "launch_ok",
            Self::GameCrash => "game_crash",
        }
    }
}

impl TryFrom<&str> for TelemetryEvent {
    type Error = ();

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "install_ok" => Ok(Self::InstallOk),
            "install_fail" => Ok(Self::InstallFail),
            "launch_ok" => Ok(Self::LaunchOk),
            "game_crash" => Ok(Self::GameCrash),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ReportingConsents {
    pub crash_reports: bool,
    pub telemetry_enabled: bool,
}

/// Small seam for fail-closed consent checks and isolated service tests.
pub trait ReportingConsentSource: Send + Sync {
    fn reporting_consents(&self) -> Result<ReportingConsents, ()>;
}

impl ReportingConsentSource for SettingsStore {
    fn reporting_consents(&self) -> Result<ReportingConsents, ()> {
        let settings: LauncherSettings = self.get().map_err(|_| ())?;
        Ok(ReportingConsents {
            crash_reports: settings.crash_reports,
            telemetry_enabled: settings.telemetry_enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReportingEndpoint {
    Crash,
    Telemetry,
}

impl ReportingEndpoint {
    fn url(self) -> &'static str {
        match self {
            Self::Crash => crate::brand::crash_report_url(),
            Self::Telemetry => crate::brand::telemetry_url(),
        }
    }
}

trait ReportingTransport: Send + Sync {
    fn post<'a>(
        &'a self,
        endpoint: ReportingEndpoint,
        body: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;
}

struct ReqwestReportingTransport {
    client: Option<Client>,
}

impl ReqwestReportingTransport {
    fn new() -> Self {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()
            .ok();
        Self { client }
    }
}

impl ReportingTransport for ReqwestReportingTransport {
    fn post<'a>(
        &'a self,
        endpoint: ReportingEndpoint,
        body: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            let Some(client) = &self.client else { return };
            if body.len() > MAX_CRASH_BODY_BYTES {
                return;
            }
            // Redirects are disabled, no credentials are attached, and errors are
            // intentionally swallowed because reporting must not affect the game.
            let _ = client
                .post(endpoint.url())
                .header(CONTENT_TYPE, "application/json")
                .header(USER_AGENT, "NatuxWorldLauncher")
                .body(body)
                .send()
                .await;
        })
    }
}

pub struct ReportingService {
    transport: Arc<dyn ReportingTransport>,
}

impl ReportingService {
    pub fn new() -> Self {
        Self {
            transport: Arc::new(ReqwestReportingTransport::new()),
        }
    }

    pub async fn report_crash<S: ReportingConsentSource + ?Sized>(
        &self,
        settings: &S,
        report: CrashReport,
    ) {
        let Ok(consents) = settings.reporting_consents() else {
            return;
        };
        if !consents.crash_reports {
            return;
        }

        let Some(body) = build_crash_payload(report) else {
            return;
        };
        self.transport.post(ReportingEndpoint::Crash, body).await;
    }

    pub async fn send_telemetry<S: ReportingConsentSource + ?Sized>(
        &self,
        settings: &S,
        event: TelemetryEvent,
    ) {
        let Ok(consents) = settings.reporting_consents() else {
            return;
        };
        if !consents.telemetry_enabled {
            return;
        }

        // This matches the website's count-only contract exactly: no install ID,
        // account data, timestamp, free-form fields, or authentication headers.
        let body = json!({
            "event": event.as_str(),
            "version": env!("CARGO_PKG_VERSION"),
            "platform": environment::legacy_platform_label(std::env::consts::OS),
            "arch": environment::legacy_arch_label(std::env::consts::ARCH),
        });
        let Ok(body) = to_vec(&body) else {
            return;
        };
        if body.len() <= MAX_TELEMETRY_BODY_BYTES {
            self.transport
                .post(ReportingEndpoint::Telemetry, body)
                .await;
        }
    }

    #[cfg(test)]
    fn with_transport(transport: Arc<dyn ReportingTransport>) -> Self {
        Self { transport }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CrashPayload {
    kind: CrashKind,
    stage: String,
    message: String,
    exit_code: Option<i32>,
    logs: Vec<String>,
    version: &'static str,
    platform: &'static str,
    arch: &'static str,
}

fn build_crash_payload(report: CrashReport) -> Option<Vec<u8>> {
    let username = report.username.as_deref();
    let stage = redact_text(&truncate_utf8(&report.stage, MAX_RAW_TEXT_BYTES), username);
    let message = redact_text(
        &truncate_utf8(&report.message, MAX_RAW_TEXT_BYTES),
        username,
    );
    let stage = truncate_utf8(&stage, MAX_STAGE_BYTES);
    let message = truncate_utf8(&message, MAX_MESSAGE_BYTES);
    let mut logs: VecDeque<String> = report
        .logs
        .iter()
        .rev()
        .take(MAX_LOG_LINES)
        .map(|line| {
            let raw = truncate_utf8(line, MAX_RAW_TEXT_BYTES);
            truncate_utf8(&redact_text(&raw, username), MAX_LOG_LINE_BYTES)
        })
        .collect();
    logs.make_contiguous().reverse();

    loop {
        let payload = CrashPayload {
            kind: report.kind,
            stage: stage.clone(),
            message: message.clone(),
            exit_code: report.exit_code,
            logs: logs.iter().cloned().collect(),
            version: env!("CARGO_PKG_VERSION"),
            platform: environment::legacy_platform_label(std::env::consts::OS),
            arch: environment::legacy_arch_label(std::env::consts::ARCH),
        };
        let Ok(body) = to_vec(&payload) else {
            return None;
        };
        if body.len() <= MAX_CRASH_BODY_BYTES {
            return Some(body);
        }
        logs.pop_front()?;
    }
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_owned();
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_owned()
}

fn redact_text(text: &str, username: Option<&str>) -> String {
    let output = redact_home_paths(text);
    redact_sensitive_tokens(&redact_assignments(&output), username)
}

fn redact_home_paths(text: &str) -> String {
    let mut output = text.to_owned();
    for marker in [":\\users\\", ":/users/", ":\\users/", ":/users\\"] {
        output = replace_path_user_segments(&output, marker, true);
    }
    for marker in ["/home/", "/users/"] {
        output = replace_path_user_segments(&output, marker, false);
    }
    output
}

fn replace_path_user_segments(text: &str, marker: &str, windows: bool) -> String {
    let mut output = text.to_owned();
    let mut offset = 0;
    while let Some(found) = find_ascii_case_insensitive(&output[offset..], marker) {
        let marker_at = offset + found;
        if windows && (marker_at == 0 || !output.as_bytes()[marker_at - 1].is_ascii_alphabetic()) {
            offset = marker_at + marker.len();
            continue;
        }
        let user_start = marker_at + marker.len();
        let user_end = output[user_start..]
            .find(|ch: char| {
                ch == '/' || ch == '\\' || ch.is_whitespace() || ch == '"' || ch == '\''
            })
            .map(|relative| user_start + relative)
            .unwrap_or(output.len());
        if user_end == user_start {
            offset = user_end.saturating_add(1);
            continue;
        }
        output.replace_range(user_start..user_end, "<user>");
        offset = user_start + "<user>".len();
    }
    output
}

fn find_ascii_case_insensitive(text: &str, needle: &str) -> Option<usize> {
    text.as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

fn redact_assignments(text: &str) -> String {
    let keys = [
        "accessToken",
        "apiKey",
        "password",
        "nickname",
        "username",
        "session",
        "token",
        "player",
        "user",
        "nick",
    ];
    let bytes = text.as_bytes();
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    while cursor < bytes.len() {
        let matched = keys.iter().find_map(|key| {
            let end = cursor.checked_add(key.len())?;
            if end > bytes.len() || !bytes[cursor..end].eq_ignore_ascii_case(key.as_bytes()) {
                return None;
            }
            if cursor > 0 && is_identifier_byte(bytes[cursor - 1]) {
                return None;
            }
            Some((key, end))
        });
        let Some((_key, mut value_start)) = matched else {
            let next = cursor
                + text[cursor..]
                    .chars()
                    .next()
                    .map(char::len_utf8)
                    .unwrap_or(1);
            output.push_str(&text[cursor..next]);
            cursor = next;
            continue;
        };
        let mut separator = value_start;
        while bytes.get(separator).is_some_and(u8::is_ascii_whitespace) {
            separator += 1;
        }
        if !matches!(bytes.get(separator).copied(), Some(b'=' | b':')) {
            output.push_str(&text[cursor..value_start]);
            cursor = value_start;
            continue;
        }
        separator += 1;
        while bytes.get(separator).is_some_and(u8::is_ascii_whitespace) {
            separator += 1;
        }
        let quote = bytes
            .get(separator)
            .copied()
            .filter(|byte| *byte == b'\'' || *byte == b'"');
        value_start = separator + if quote.is_some() { 1 } else { 0 };
        let value_end = if let Some(quote) = quote {
            bytes[value_start..]
                .iter()
                .position(|byte| *byte == quote || *byte == b'\r' || *byte == b'\n')
                .map(|relative| value_start + relative)
                .unwrap_or(bytes.len())
        } else {
            bytes[value_start..]
                .iter()
                .position(|byte| byte.is_ascii_whitespace() || *byte == b',' || *byte == b';')
                .map(|relative| value_start + relative)
                .unwrap_or(bytes.len())
        };
        output.push_str(&text[cursor..value_start]);
        output.push_str("<redacted>");
        cursor = value_end;
    }
    output
}

fn is_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn redact_sensitive_tokens(text: &str, username: Option<&str>) -> String {
    let bytes = text.as_bytes();
    let mut output = String::with_capacity(text.len());
    let username = username.filter(|name| name.is_ascii() && (3..=64).contains(&name.len()));
    let mut cursor = 0;
    while cursor < bytes.len() {
        if let Some(nick) = username.filter(|name| {
            bytes[cursor..]
                .get(..name.len())
                .is_some_and(|value| value.eq_ignore_ascii_case(name.as_bytes()))
        }) {
            output.push_str("<nick>");
            cursor += nick.len();
            continue;
        }
        if bytes[cursor] == b'<' {
            if let Some(relative_end) = text[cursor + 1..].find('>') {
                let end = cursor + relative_end + 1;
                let name = &text[cursor + 1..end];
                let tag = (3..=16).contains(&name.len())
                    && name
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
                    && !["init", "clinit", "nick", "uuid", "redacted", "user"]
                        .iter()
                        .any(|known| name.eq_ignore_ascii_case(known));
                if tag {
                    output.push_str("<nick>");
                    cursor = end + 1;
                    continue;
                }
            }
        }
        if is_opaque_byte(bytes[cursor]) && (cursor == 0 || !is_opaque_byte(bytes[cursor - 1])) {
            let end = bytes[cursor..]
                .iter()
                .position(|byte| !is_opaque_byte(*byte))
                .map(|relative| cursor + relative)
                .unwrap_or(bytes.len());
            if end - cursor >= 32 {
                output.push_str("<redacted>");
                cursor = end;
                continue;
            }
        }
        let next = cursor
            + text[cursor..]
                .chars()
                .next()
                .map(char::len_utf8)
                .unwrap_or(1);
        output.push_str(&text[cursor..next]);
        cursor = next;
    }
    output
}

fn is_opaque_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')
}

#[cfg(test)]
#[path = "reporting/tests.rs"]
mod tests;
