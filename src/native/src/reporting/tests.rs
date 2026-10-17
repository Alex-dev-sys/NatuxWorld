use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::*;

#[derive(Debug)]
struct CapturedRequest {
    endpoint: ReportingEndpoint,
    body: Vec<u8>,
}

#[derive(Default)]
struct MockTransport {
    requests: Mutex<Vec<CapturedRequest>>,
}

impl ReportingTransport for MockTransport {
    fn post<'a>(
        &'a self,
        endpoint: ReportingEndpoint,
        body: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            self.requests
                .lock()
                .unwrap()
                .push(CapturedRequest { endpoint, body });
        })
    }
}

struct FakeSettings(Result<ReportingConsents, ()>);

impl ReportingConsentSource for FakeSettings {
    fn reporting_consents(&self) -> Result<ReportingConsents, ()> {
        self.0
    }
}

fn service() -> (ReportingService, Arc<MockTransport>) {
    let transport = Arc::new(MockTransport::default());
    (
        ReportingService::with_transport(transport.clone()),
        transport,
    )
}

fn consents(crash_reports: bool, telemetry_enabled: bool) -> FakeSettings {
    FakeSettings(Ok(ReportingConsents {
        crash_reports,
        telemetry_enabled,
    }))
}

fn sample_report() -> CrashReport {
    CrashReport {
        kind: CrashKind::GameCrash,
        stage: "running".to_owned(),
        message: "game process exited".to_owned(),
        exit_code: Some(1),
        logs: vec!["[stderr] crash line".to_owned()],
        username: None,
    }
}

#[tokio::test]
async fn sends_nothing_without_the_matching_consent_or_when_settings_fail() {
    let (service, transport) = service();
    let no_consent = consents(false, false);
    service.report_crash(&no_consent, sample_report()).await;
    service
        .send_telemetry(&no_consent, TelemetryEvent::LaunchOk)
        .await;
    service
        .report_crash(&FakeSettings(Err(())), sample_report())
        .await;
    service
        .send_telemetry(&FakeSettings(Err(())), TelemetryEvent::LaunchOk)
        .await;
    assert!(transport.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn crash_report_redacts_nickname_paths_credentials_and_uuids() {
    let (service, transport) = service();
    let logs = vec![
        "[Client thread/INFO]: Setting user: Alice".to_owned(),
        "[CHAT] <Alice> Alice joined the game".to_owned(),
        "profile username=\"Alice\"".to_owned(),
        r"Loading C:\Users\Alice\AppData\Roaming\.minecraft".to_owned(),
        "/home/bob/.minecraft/logs/latest.log".to_owned(),
        "accessToken=eyJhbGciOiJIUzI1NiJ9.sensitivepayload".to_owned(),
        "password: super-secret-password".to_owned(),
        "session='session-secret-value'".to_owned(),
        "069a79f4-44e9-4726-a5be-fca90e38aaf5".to_owned(),
        "at java.lang.Object.<init>(Object.java:37)".to_owned(),
    ];
    service
        .report_crash(
            &consents(true, false),
            CrashReport {
                stage: "running Alice".to_owned(),
                message: "crash for Alice".to_owned(),
                logs,
                username: Some("Alice".to_owned()),
                ..sample_report()
            },
        )
        .await;

    let requests = transport.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].endpoint, ReportingEndpoint::Crash);
    let raw = String::from_utf8(requests[0].body.clone()).unwrap();
    for secret in [
        "Alice",
        "bob",
        "super-secret-password",
        "session-secret-value",
        "eyJhbGciOiJIUzI1NiJ9",
        "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    ] {
        assert!(!raw.contains(secret), "report leaked {secret}");
    }
    assert!(raw.contains("<user>"));
    assert!(raw.contains("<init>"));
    let payload: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(payload["kind"], "game-crash");
    assert_eq!(payload["exitCode"], 1);
    assert!(!payload.as_object().unwrap().contains_key("username"));
    assert!(!payload.as_object().unwrap().contains_key("token"));
}

#[tokio::test]
async fn crash_payload_is_bounded_and_keeps_the_latest_log_tail() {
    let (service, transport) = service();
    let logs = (0..500)
        .map(|index| format!("line {index} {}", "\u{1}".repeat(2_500)))
        .collect();
    service
        .report_crash(
            &consents(true, false),
            CrashReport {
                stage: "s".repeat(500),
                message: "m".repeat(100_000),
                logs,
                ..sample_report()
            },
        )
        .await;

    let requests = transport.requests.lock().unwrap();
    let body = &requests[0].body;
    assert!(body.len() <= MAX_CRASH_BODY_BYTES);
    let payload: Value = serde_json::from_slice(body).unwrap();
    assert!(payload["stage"].as_str().unwrap().len() <= MAX_STAGE_BYTES);
    assert!(payload["message"].as_str().unwrap().len() <= MAX_MESSAGE_BYTES);
    let lines = payload["logs"].as_array().unwrap();
    assert!(lines.len() <= MAX_LOG_LINES);
    assert!(lines
        .iter()
        .all(|line| line.as_str().unwrap().len() <= MAX_LOG_LINE_BYTES));
    assert!(lines
        .last()
        .unwrap()
        .as_str()
        .unwrap()
        .starts_with("line 499 "));
}

#[tokio::test]
async fn telemetry_is_allowlisted_count_only_and_uses_its_own_consent() {
    let (service, transport) = service();
    service
        .send_telemetry(&consents(false, true), TelemetryEvent::InstallFail)
        .await;

    let requests = transport.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].endpoint, ReportingEndpoint::Telemetry);
    let payload: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(payload["event"], "install_fail");
    assert_eq!(
        payload["platform"],
        super::environment::legacy_platform_label(std::env::consts::OS)
    );
    assert_eq!(
        payload["arch"],
        super::environment::legacy_arch_label(std::env::consts::ARCH)
    );
    let fields = payload.as_object().unwrap();
    assert_eq!(fields.len(), 4);
    for field in ["event", "version", "platform", "arch"] {
        assert!(fields.contains_key(field));
    }
    for forbidden in ["installId", "username", "user", "token", "logs", "ts"] {
        assert!(!fields.contains_key(forbidden));
    }
    assert!(TelemetryEvent::try_from("launch_ok").is_ok());
    assert!(TelemetryEvent::try_from("send-token").is_err());
}

#[test]
fn telemetry_platform_and_arch_labels_match_existing_electron_values() {
    assert_eq!(
        super::environment::legacy_platform_label("windows"),
        "win32"
    );
    assert_eq!(super::environment::legacy_platform_label("macos"), "darwin");
    assert_eq!(super::environment::legacy_platform_label("linux"), "linux");
    assert_eq!(super::environment::legacy_arch_label("x86_64"), "x64");
    assert_eq!(super::environment::legacy_arch_label("aarch64"), "arm64");
    assert_eq!(super::environment::legacy_arch_label("x86"), "ia32");
    assert_eq!(super::environment::legacy_arch_label("riscv64"), "riscv64");
}

#[test]
fn report_routes_follow_the_selected_build_origin() {
    assert_eq!(
        ReportingEndpoint::Crash.url(),
        format!("{}/api/crash-report", crate::brand::site_origin())
    );
    assert_eq!(
        ReportingEndpoint::Telemetry.url(),
        format!("{}/api/launcher-events", crate::brand::site_origin())
    );
}

#[test]
fn report_input_rejects_unrecognized_fields() {
    let mut value = json!({
        "kind": "game-crash",
        "stage": "running",
        "message": "failed",
        "exitCode": 1,
        "logs": [],
        "username": "Alice",
        "token": "must not be accepted"
    });
    assert!(serde_json::from_value::<CrashReport>(value.clone()).is_err());
    value.as_object_mut().unwrap().remove("token");
    let report = serde_json::from_value::<CrashReport>(value).unwrap();
    assert_eq!(report.username.as_deref(), Some("Alice"));
}
