use std::sync::Arc;

use crate::account::AccountService;
use crate::cancellation::CancellationToken;
use crate::playtime::PlaytimeService;
use crate::reporting::ReportingService;
use crate::settings::SettingsStore;

use super::LaunchProgress;

pub(super) struct RuntimeState {
    pub(super) busy: bool,
    pub(super) generation: u64,
    pub(super) progress: LaunchProgress,
    pub(super) cancellation: Option<CancellationToken>,
    pub(super) exit_after_pipeline: bool,
}

impl RuntimeState {
    pub(super) fn new() -> Self {
        Self {
            busy: false,
            generation: 0,
            progress: LaunchProgress::new("idle", 0, "Готов к запуску"),
            cancellation: None,
            exit_after_pipeline: false,
        }
    }

    pub(super) fn defer_exit_until_pipeline_finishes(&mut self) -> bool {
        if !self.busy {
            return false;
        }
        self.exit_after_pipeline = true;
        true
    }

    pub(super) fn cancel_deferred_exit(&mut self) {
        self.exit_after_pipeline = false;
    }

    pub(super) fn finish_pipeline(&mut self, progress: LaunchProgress) -> bool {
        self.busy = false;
        self.cancellation = None;
        self.progress = progress;
        self.exit_after_pipeline
    }
}

pub(super) struct LaunchContext<'a> {
    pub(super) settings: &'a SettingsStore,
    pub(super) account: &'a AccountService,
    pub(super) playtime: Arc<PlaytimeService>,
    pub(super) reporting: Arc<ReportingService>,
}
