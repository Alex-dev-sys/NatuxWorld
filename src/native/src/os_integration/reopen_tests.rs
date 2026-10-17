use crate::{reopen_action, ReopenAction};

#[test]
fn reopening_with_any_visible_window_does_not_show_or_focus_the_main_window() {
    assert_eq!(
        reopen_action(true, true),
        ReopenAction::LeaveVisibleWindowsAlone
    );
    assert_eq!(
        reopen_action(true, false),
        ReopenAction::LeaveVisibleWindowsAlone
    );
}

#[test]
fn reopening_without_visible_windows_shows_or_recreates_the_main_window() {
    assert_eq!(reopen_action(false, true), ReopenAction::ShowMainWindow);
    assert_eq!(
        reopen_action(false, false),
        ReopenAction::RecreateMainWindow
    );
}
