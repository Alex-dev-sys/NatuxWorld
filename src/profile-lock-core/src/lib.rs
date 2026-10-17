mod error;
mod file_lock;
mod normalize;
mod platform;
mod registry;

pub use error::LockError;
pub use file_lock::{GameLock, LockGuard, ProfileLock};

use std::path::{Path, PathBuf};

const PROFILE_LOCK_NAME: &str = ".profile.lock";
const GAME_LOCK_NAME: &str = ".game.lock";

/// Returns the persistent lock path used to serialize launcher access to `user_data`.
pub fn profile_lock_path(user_data: &Path) -> PathBuf {
    user_data.join(PROFILE_LOCK_NAME)
}

/// Returns the persistent lock path held by the Java game process.
pub fn game_lock_path(user_data: &Path) -> PathBuf {
    user_data.join(GAME_LOCK_NAME)
}

/// Tries to hold the profile lock without waiting.
///
/// `Ok(None)` means another process owns the lock. Other failures must be treated as
/// fail-closed errors. The lock file is never removed or truncated.
pub fn try_acquire_profile(user_data: &Path) -> Result<Option<ProfileLock>, LockError> {
    ProfileLock::try_acquire(user_data)
}

/// Tries to hold the game lock without waiting.
///
/// Launchers normally use [`probe_game`] instead. This function is public so the
/// Java-agent contract can be tested against the same byte-range semantics.
pub fn try_acquire_game(user_data: &Path) -> Result<Option<GameLock>, LockError> {
    GameLock::try_acquire(user_data)
}

/// Returns `true` when another process currently owns `.game.lock`.
///
/// Call while holding `.profile.lock`; probing the same file from a process that
/// already owns a guard is rejected to preserve the one-descriptor Unix contract.
pub fn probe_game(user_data: &Path) -> Result<bool, LockError> {
    GameLock::probe(user_data)
}

/// Tries to acquire an exclusive lock over byte range `[0, 1)` at `path`.
///
/// This low-level entry point is useful for interop tests. Production launchers
/// should prefer the profile/game-specific helpers above.
pub fn try_acquire(path: &Path) -> Result<Option<LockGuard>, LockError> {
    LockGuard::try_acquire(path)
}

/// Probes an arbitrary lock path. `true` means another process owns the byte range.
pub fn probe(path: &Path) -> Result<bool, LockError> {
    Ok(LockGuard::try_acquire(path)?.is_none())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
compile_error!("natux-profile-lock-core supports only Windows, macOS, and Linux");

#[cfg(test)]
mod unit_tests {
    use super::*;
    use std::fs;

    #[test]
    fn release_and_reacquire_reuse_the_same_open_handle() {
        let temp = tempfile::tempdir().unwrap();
        let path = profile_lock_path(temp.path());
        let mut guard = try_acquire(&path).unwrap().expect("first lock is free");

        assert!(guard.is_held());
        guard.release().unwrap();
        assert!(!guard.is_held());
        assert!(guard.try_reacquire().unwrap());
        assert!(guard.is_held());
    }

    #[test]
    fn same_process_cannot_open_the_same_lock_twice() {
        let temp = tempfile::tempdir().unwrap();
        let path = profile_lock_path(temp.path());
        let _guard = try_acquire(&path).unwrap().expect("first lock is free");

        assert!(matches!(
            try_acquire(&path),
            Err(LockError::AlreadyOpenInProcess(_))
        ));
    }

    #[test]
    fn lock_file_is_persistent_and_empty() {
        let temp = tempfile::tempdir().unwrap();
        let path = profile_lock_path(temp.path());
        let guard = try_acquire(&path).unwrap().expect("first lock is free");
        assert!(path.exists());
        assert_eq!(fs::metadata(&path).unwrap().len(), 0);
        drop(guard);
        assert!(path.exists());
        assert_eq!(fs::metadata(&path).unwrap().len(), 0);
    }

    #[test]
    fn typed_guards_use_the_shared_profile_and_game_names() {
        let temp = tempfile::tempdir().unwrap();
        let profile = ProfileLock::try_acquire(temp.path())
            .unwrap()
            .expect("profile lock is free");
        assert_eq!(
            profile.path().file_name().unwrap(),
            profile_lock_path(temp.path()).file_name().unwrap()
        );
        drop(profile);

        let game = GameLock::try_acquire(temp.path())
            .unwrap()
            .expect("game lock is free");
        assert_eq!(
            game.path().file_name().unwrap(),
            game_lock_path(temp.path()).file_name().unwrap()
        );
    }
}
