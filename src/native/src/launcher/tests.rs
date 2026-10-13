use super::profile::{resolve_profile, sanitize_server};
use super::reporting::launch_failure_report;
use super::{LaunchProgress, LauncherService, PlayOptions};
use crate::reporting::CrashKind;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};

#[derive(Default)]
struct WakeFlag(AtomicBool);

impl Wake for WakeFlag {
    fn wake(self: Arc<Self>) {
        self.0.store(true, Ordering::SeqCst);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.0.store(true, Ordering::SeqCst);
    }
}

fn options(version: &str, loader: Option<&str>, server: Option<&str>) -> PlayOptions {
    PlayOptions {
        version: version.to_owned(),
        loader: loader.map(str::to_owned),
        server: server.map(str::to_owned),
    }
}

#[test]
fn resolves_only_supported_versions_and_loaders_without_trusting_renderer_names() {
    assert_eq!(
        resolve_profile(&options("forge-1.21.1", None, None)).expect("Forge profile"),
        ("forge".to_owned(), "1.21.1".to_owned())
    );
    assert_eq!(
        resolve_profile(&options("1.21.1", Some("forge"), None)).expect("explicit Forge"),
        ("forge".to_owned(), "1.21.1".to_owned())
    );
    assert!(resolve_profile(&options("../outside", None, None)).is_err());
    assert!(resolve_profile(&options("fabric-1.21.1", None, None)).is_err());
    assert!(resolve_profile(&options("forge-1.21.1", Some("vanilla"), None)).is_err());
}

#[test]
fn validates_quick_play_host_and_port() {
    assert_eq!(
        sanitize_server("play.example.org:25565").expect("valid server"),
        "play.example.org:25565"
    );
    assert!(sanitize_server("-bad.example.org").is_err());
    assert!(sanitize_server("play.example.org:0").is_err());
    assert!(sanitize_server("play.example.org:70000").is_err());
    assert!(sanitize_server("play.example.org\n--username=other").is_err());
}

#[test]
fn launch_failure_report_carries_verified_username_as_a_redaction_hint() {
    let report = launch_failure_report(
        "forge-install".to_owned(),
        "Failed to launch for VerifiedPlayer".to_owned(),
        Some("VerifiedPlayer".to_owned()),
    );

    assert_eq!(report.kind, CrashKind::LaunchError);
    assert_eq!(report.username.as_deref(), Some("VerifiedPlayer"));
    assert!(report.message.contains("VerifiedPlayer"));
}

#[test]
fn cancel_waits_until_pipeline_finishes() {
    let launcher = LauncherService::default();
    let cancellation = launcher.begin().expect("begin launch");
    let mut cancel_wait = Box::pin(launcher.cancel_and_wait());

    let wake_flag = Arc::new(WakeFlag::default());
    let waker = Waker::from(Arc::clone(&wake_flag));
    let mut context = Context::from_waker(&waker);
    assert!(matches!(
        Pin::as_mut(&mut cancel_wait).poll(&mut context),
        Poll::Pending
    ));
    assert!(cancellation.is_cancelled());
    assert!(launcher.state.lock().expect("launcher state").busy);

    assert!(
        launcher
            .finish_pipeline_state(LaunchProgress::new("idle", 0, "Отменено"))
            .0
    );
    // `finish_pipeline` emits terminal progress before waking cancellation waiters.
    launcher.pipeline_finished.notify_waiters();
    assert!(wake_flag.0.load(Ordering::SeqCst));
    assert!(Pin::as_mut(&mut cancel_wait).poll(&mut context).is_ready());

    assert!(!launcher.state.lock().expect("launcher state").busy);
}

#[test]
fn cancel_returns_immediately_when_no_pipeline_is_active() {
    let launcher = LauncherService::default();
    let mut cancel_wait = Box::pin(launcher.cancel_and_wait());
    let waker = Waker::noop();
    let mut context = Context::from_waker(waker);

    assert!(Pin::as_mut(&mut cancel_wait).poll(&mut context).is_ready());
}

#[test]
fn cancel_wait_does_not_cancel_a_later_pipeline() {
    let launcher = LauncherService::default();
    let first_cancellation = launcher.begin().expect("begin first launch");
    let mut cancel_wait = Box::pin(launcher.cancel_and_wait());
    let waker = Waker::noop();
    let mut context = Context::from_waker(waker);

    assert!(Pin::as_mut(&mut cancel_wait)
        .poll(&mut context)
        .is_pending());
    assert!(first_cancellation.is_cancelled());

    assert!(
        launcher
            .finish_pipeline_state(LaunchProgress::new("idle", 0, "Отменено"))
            .0
    );
    launcher.pipeline_finished.notify_waiters();
    let next_cancellation = launcher.begin().expect("begin next launch");

    assert!(Pin::as_mut(&mut cancel_wait).poll(&mut context).is_ready());
    assert!(!next_cancellation.is_cancelled());
}

#[test]
fn launcher_exit_waits_for_the_game_pipeline_and_reopening_cancels_it() {
    let launcher = LauncherService::default();
    assert!(!launcher.defer_exit_until_pipeline_finishes());

    launcher.begin().expect("start game pipeline");
    assert!(launcher.defer_exit_until_pipeline_finishes());
    let (finished, should_exit) =
        launcher.finish_pipeline_state(LaunchProgress::new("idle", 0, "Игра завершена"));
    assert!(finished);
    assert!(should_exit);
    assert!(
        launcher.begin().is_err(),
        "do not restart during a deferred exit"
    );

    launcher.cancel_deferred_exit();
    assert!(
        launcher.begin().is_ok(),
        "a reopened launcher can start again"
    );
}
