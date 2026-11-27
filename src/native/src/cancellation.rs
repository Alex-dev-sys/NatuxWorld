use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::Notify;

/// Cloneable cancellation signal shared by one installation/launch pipeline.
#[derive(Clone, Default)]
pub(crate) struct CancellationToken {
    inner: Arc<Inner>,
}

#[derive(Default)]
struct Inner {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancellationToken {
    pub(crate) fn cancel(&self) {
        self.inner.cancelled.store(true, Ordering::Release);
        self.inner.notify.notify_waiters();
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.inner.cancelled.load(Ordering::Acquire)
    }

    /// Resolves once `cancel` has been called. Waiters sleep until notified
    /// instead of polling, so thousands of queued download jobs cost no CPU.
    pub(crate) async fn cancelled(&self) {
        loop {
            let notified = self.inner.notify.notified();
            tokio::pin!(notified);
            // Register before re-checking the flag so a concurrent cancel is not missed.
            notified.as_mut().enable();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::CancellationToken;

    #[tokio::test]
    async fn waiters_wake_when_cancelled_and_late_waiters_return_immediately() {
        let token = CancellationToken::default();
        let waiter = token.clone();
        let handle = tokio::spawn(async move { waiter.cancelled().await });
        tokio::task::yield_now().await;
        token.cancel();
        tokio::time::timeout(Duration::from_secs(5), handle)
            .await
            .expect("waiter is woken")
            .expect("waiter task");
        tokio::time::timeout(Duration::from_secs(5), token.cancelled())
            .await
            .expect("an already cancelled token resolves at once");
    }
}
