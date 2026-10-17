use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::reporting::{CrashKind, CrashReport, ReportingService, TelemetryEvent};
use crate::settings::SettingsStore;

pub(super) fn launch_failure(
    app: AppHandle,
    reporting: Arc<ReportingService>,
    stage: String,
    message: String,
    username: Option<String>,
    logs: Vec<String>,
) {
    tokio::spawn(async move {
        let settings = app.state::<SettingsStore>();
        reporting
            .send_telemetry(settings.inner(), TelemetryEvent::InstallFail)
            .await;
        reporting
            .report_crash(
                settings.inner(),
                launch_failure_report(stage, message, username, logs),
            )
            .await;
    });
}

pub(super) fn launch_failure_report(
    stage: String,
    message: String,
    username: Option<String>,
    logs: Vec<String>,
) -> CrashReport {
    CrashReport {
        kind: CrashKind::LaunchError,
        stage,
        message,
        exit_code: None,
        logs,
        username,
    }
}

pub(super) fn launch_succeeded(app: AppHandle, reporting: Arc<ReportingService>) {
    tokio::spawn(async move {
        let settings = app.state::<SettingsStore>();
        reporting
            .send_telemetry(settings.inner(), TelemetryEvent::LaunchOk)
            .await;
    });
}

pub(super) fn game_crash(
    app: AppHandle,
    reporting: Arc<ReportingService>,
    username: String,
    exit_code: Option<i32>,
    logs: Vec<String>,
    message: String,
) {
    tokio::spawn(async move {
        let settings = app.state::<SettingsStore>();
        reporting
            .send_telemetry(settings.inner(), TelemetryEvent::GameCrash)
            .await;
        reporting
            .report_crash(
                settings.inner(),
                CrashReport {
                    kind: CrashKind::GameCrash,
                    stage: "running".to_owned(),
                    message,
                    exit_code,
                    logs,
                    username: Some(username),
                },
            )
            .await;
    });
}
