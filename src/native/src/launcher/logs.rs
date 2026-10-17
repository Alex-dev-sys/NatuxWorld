use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use super::process::LauncherLog;

const MAX_LINES: usize = 300;
const MAX_LINE_BYTES: usize = 8192;

/// One launch attempt owns its own bounded tail, including output before readiness.
#[derive(Clone, Default)]
pub(crate) struct LaunchLogTail(Arc<Mutex<LogState>>);

#[derive(Default)]
struct LogState {
    access_token: String,
    lines: VecDeque<String>,
}

impl LaunchLogTail {
    pub(super) fn set_access_token(&self, token: &str) {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .access_token = token.to_owned();
    }

    /// Redacts the live token before storage and before output reaches the renderer.
    pub(super) fn record(&self, mut log: LauncherLog) -> LauncherLog {
        {
            let mut state = self
                .0
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if !state.access_token.is_empty() {
                log.line = log.line.replace(&state.access_token, "[redacted]");
            }
            let mut end = log.line.len().min(MAX_LINE_BYTES);
            while !log.line.is_char_boundary(end) {
                end -= 1;
            }
            log.line.truncate(end);
            if state.lines.len() == MAX_LINES {
                state.lines.pop_front();
            }
            state
                .lines
                .push_back(format!("[{}] {}", log.stream, log.line));
        }
        log
    }

    pub(super) fn snapshot(&self) -> Vec<String> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .lines
            .iter()
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_tail_is_bounded_redacted_and_local_to_one_attempt() {
        let tail = LaunchLogTail::default();
        tail.set_access_token("live-secret");
        for index in 0..=MAX_LINES {
            let log = tail.record(LauncherLog {
                stream: "forge".into(),
                line: format!("{index}: token=live-secret {}", "я".repeat(MAX_LINE_BYTES)),
            });
            assert!(!log.line.contains("live-secret"));
            assert!(log.line.len() <= MAX_LINE_BYTES);
        }
        let logs = tail.snapshot();
        assert_eq!(logs.len(), MAX_LINES);
        assert!(logs[0].starts_with("[forge] 1: token=[redacted]"));
        assert!(logs.last().unwrap().starts_with("[forge] 300:"));
        assert!(LaunchLogTail::default().snapshot().is_empty());
    }
}
