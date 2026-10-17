use std::future::Future;
use std::time::Duration;

use crate::cancellation::CancellationToken;

const MAX_ATTEMPTS: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RetryFailure {
    Transient(String),
    Permanent(String),
}

impl RetryFailure {
    pub(crate) fn transient(message: impl Into<String>) -> Self {
        Self::Transient(message.into())
    }

    pub(crate) fn permanent(message: impl Into<String>) -> Self {
        Self::Permanent(message.into())
    }
}

pub(crate) fn is_transient_http_status(status: u16) -> bool {
    matches!(status, 408 | 425 | 429) || (500..=599).contains(&status)
}

pub(crate) async fn retry_transient<T, F, Fut>(
    cancellation: &CancellationToken,
    mut operation: F,
) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, RetryFailure>>,
{
    for attempt in 0..MAX_ATTEMPTS {
        let result = tokio::select! {
            _ = cancellation.cancelled() => return Err("Отменено".to_owned()),
            result = operation() => result,
        };
        match result {
            Ok(value) => return Ok(value),
            Err(RetryFailure::Permanent(message)) => return Err(message),
            Err(RetryFailure::Transient(_)) if attempt + 1 < MAX_ATTEMPTS => {
                let delay = Duration::from_millis(500_u64 << attempt);
                tokio::select! {
                    _ = cancellation.cancelled() => return Err("Отменено".to_owned()),
                    _ = tokio::time::sleep(delay) => {},
                }
            }
            Err(RetryFailure::Transient(message)) => return Err(message),
        }
    }
    unreachable!("retry loop returns a result or error on every attempt")
}

#[cfg(test)]
#[path = "retry/tests.rs"]
mod tests;
