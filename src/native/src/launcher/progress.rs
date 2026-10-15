use super::LauncherService;
use serde::Serialize;
use std::{path::Path, sync::Arc};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchProgress {
    pub(crate) stage: String,
    pub(crate) progress: u8,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) detail: Option<String>,
}

impl LauncherService {
    pub(super) fn progress_sink(
        &self,
        app: AppHandle,
    ) -> Arc<dyn Fn(LaunchProgress) + Send + Sync> {
        let service = self.clone();
        Arc::new(move |progress| service.report(&app, progress))
    }

    pub(super) fn download_progress(
        &self,
        app: AppHandle,
        stage: &'static str,
        message: &'static str,
    ) -> impl Fn(u64, u64, &Path) + Send + Sync + 'static {
        let service = self.clone();
        move |done, total, path| {
            let percent = done
                .saturating_mul(100)
                .checked_div(total)
                .unwrap_or(0)
                .min(100) as u8;
            let detail = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            service.report(
                &app,
                LaunchProgress::new(stage, percent, message).with_detail(detail),
            );
        }
    }

    pub(super) fn report(&self, app: &AppHandle, progress: LaunchProgress) {
        if let Ok(mut state) = self.state.lock() {
            state.progress = progress.clone();
        }
        let _ = app.emit("launcher:progress", progress);
    }

    pub(super) fn finish_pipeline(&self, app: &AppHandle, progress: LaunchProgress) {
        let (finished, exit_after_pipeline) = self.finish_pipeline_state(progress.clone());
        let _ = app.emit("launcher:progress", progress);
        if finished {
            self.pipeline_finished.notify_waiters();
        }
        if exit_after_pipeline {
            app.exit(0);
        }
    }

    pub(super) fn finish_pipeline_state(&self, progress: LaunchProgress) -> (bool, bool) {
        if let Ok(mut state) = self.state.lock() {
            let exit_after_pipeline = state.finish_pipeline(progress);
            (true, exit_after_pipeline)
        } else {
            (false, false)
        }
    }
}

impl LaunchProgress {
    pub(crate) fn new(stage: &str, progress: u8, message: &str) -> Self {
        Self {
            stage: stage.to_owned(),
            progress: progress.min(100),
            message: message.to_owned(),
            detail: None,
        }
    }

    pub(crate) fn with_detail(mut self, detail: &str) -> Self {
        self.detail = Some(detail.chars().take(160).collect());
        self
    }
}
