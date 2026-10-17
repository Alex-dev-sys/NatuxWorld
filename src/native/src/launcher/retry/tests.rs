use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use crate::cancellation::CancellationToken;

use super::{is_transient_http_status, retry_transient, RetryFailure};

#[tokio::test]
async fn retries_transient_failures_up_to_three_attempts_then_succeeds() {
    let cancellation = CancellationToken::default();
    let attempts = Arc::new(AtomicUsize::new(0));
    let result = retry_transient(&cancellation, || {
        let attempts = Arc::clone(&attempts);
        async move {
            if attempts.fetch_add(1, Ordering::SeqCst) < 2 {
                Err(RetryFailure::transient("connection reset"))
            } else {
                Ok("metadata")
            }
        }
    })
    .await;

    assert_eq!(result, Ok("metadata"));
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn does_not_retry_permanent_errors() {
    let cancellation = CancellationToken::default();
    let attempts = Arc::new(AtomicUsize::new(0));
    let result = retry_transient(&cancellation, || {
        let attempts = Arc::clone(&attempts);
        async move {
            attempts.fetch_add(1, Ordering::SeqCst);
            Err::<(), _>(RetryFailure::permanent("HTTP 404"))
        }
    })
    .await;

    assert_eq!(result, Err("HTTP 404".to_owned()));
    assert_eq!(attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancellation_during_backoff_prevents_another_request() {
    let cancellation = CancellationToken::default();
    let attempts = Arc::new(AtomicUsize::new(0));
    let task_cancellation = cancellation.clone();
    let task_attempts = Arc::clone(&attempts);
    let task = tokio::spawn(async move {
        retry_transient(&task_cancellation, || {
            let attempts = Arc::clone(&task_attempts);
            async move {
                attempts.fetch_add(1, Ordering::SeqCst);
                Err::<(), _>(RetryFailure::transient("temporary failure"))
            }
        })
        .await
    });

    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    cancellation.cancel();

    assert_eq!(task.await.expect("retry task"), Err("Отменено".to_owned()));
    assert_eq!(attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancellation_during_request_drops_the_in_flight_operation() {
    let cancellation = CancellationToken::default();
    let task_cancellation = cancellation.clone();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let mut started_tx = Some(started_tx);
        retry_transient(&task_cancellation, || {
            let started = started_tx.take();
            async move {
                if let Some(started) = started {
                    let _ = started.send(());
                }
                std::future::pending::<Result<(), RetryFailure>>().await
            }
        })
        .await
    });

    started_rx.await.expect("operation started");
    cancellation.cancel();

    let result = tokio::time::timeout(std::time::Duration::from_secs(1), task)
        .await
        .expect("cancellation must drop the pending request")
        .expect("retry task");
    assert_eq!(result, Err("Отменено".to_owned()));
}

#[test]
fn retries_only_temporary_http_statuses() {
    for status in [408, 425, 429, 500, 502, 503, 599] {
        assert!(is_transient_http_status(status), "status {status}");
    }
    for status in [200, 301, 400, 401, 404] {
        assert!(!is_transient_http_status(status), "status {status}");
    }
}
