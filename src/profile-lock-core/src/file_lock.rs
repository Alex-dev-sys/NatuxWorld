use std::fs::File;
use std::path::{Path, PathBuf};

use crate::error::LockError;
use crate::platform;
use crate::registry;

/// App-lifetime lock for settings, accounts, and other shared launcher data.
#[derive(Debug)]
pub struct ProfileLock(LockGuard);

impl ProfileLock {
    /// Tries to acquire `user_data/.profile.lock` without waiting.
    pub fn try_acquire(user_data: &Path) -> Result<Option<Self>, LockError> {
        LockGuard::try_acquire(&crate::profile_lock_path(user_data)).map(|guard| guard.map(Self))
    }

    pub fn path(&self) -> &Path {
        self.0.path()
    }

    pub fn is_held(&self) -> bool {
        self.0.is_held()
    }
}

/// Game/runtime lock held during profile mutations and by the Java agent at runtime.
#[derive(Debug)]
pub struct GameLock(LockGuard);

impl GameLock {
    /// Tries to acquire `user_data/.game.lock` without waiting.
    pub fn try_acquire(user_data: &Path) -> Result<Option<Self>, LockError> {
        LockGuard::try_acquire(&crate::game_lock_path(user_data)).map(|guard| guard.map(Self))
    }

    /// Returns whether another process currently owns `.game.lock`.
    pub fn probe(user_data: &Path) -> Result<bool, LockError> {
        Ok(Self::try_acquire(user_data)?.is_none())
    }

    pub fn path(&self) -> &Path {
        self.0.path()
    }

    pub fn is_held(&self) -> bool {
        self.0.is_held()
    }

    /// Releases the launcher-owned lock immediately before starting the JVM.
    ///
    /// Ownership cannot be transferred atomically between processes. The Java
    /// premain agent must try-acquire this same file before Minecraft main; if a
    /// competing launcher wins the interval, the agent must abort before main.
    pub fn release_for_handoff(&mut self) -> Result<(), LockError> {
        self.0.release()
    }

    /// Reacquires after spawn failure or after confirming the JVM exited.
    pub fn try_reacquire(&mut self) -> Result<bool, LockError> {
        self.0.try_reacquire()
    }
}

/// An exclusive lock on byte range `[0, 1)` of one persistent lock file.
///
/// On Unix the process-wide registry ensures this crate never opens a second
/// descriptor for a path while a guard is alive. This matters because classic
/// `fcntl(F_SETLK)` record locks are released when any descriptor for that inode
/// is closed by the owning process.
#[derive(Debug)]
pub struct LockGuard {
    path: PathBuf,
    file: Option<File>,
    held: bool,
}

impl LockGuard {
    pub(crate) fn try_acquire(path: &Path) -> Result<Option<Self>, LockError> {
        let identity = registry::reserve(path)?;
        let file = match platform::open_lock_file(&identity) {
            Ok(file) => file,
            Err(source) if source.kind() == std::io::ErrorKind::InvalidData => {
                registry::release(&identity);
                return Err(LockError::InvalidLockFile(identity));
            }
            Err(source) => {
                registry::release(&identity);
                return Err(LockError::Open {
                    path: identity,
                    source,
                });
            }
        };
        match platform::try_lock(&file) {
            Ok(true) => Ok(Some(Self {
                path: identity,
                file: Some(file),
                held: true,
            })),
            Ok(false) => {
                drop(file);
                registry::release(&identity);
                Ok(None)
            }
            Err(source) => {
                drop(file);
                registry::release(&identity);
                Err(LockError::LockOperation {
                    path: identity,
                    source,
                })
            }
        }
    }

    /// Lockfile path associated with this guard.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Whether this guard currently owns the kernel lock.
    pub fn is_held(&self) -> bool {
        self.held
    }

    /// Releases the kernel lock while retaining its sole open descriptor.
    ///
    /// Keeping the descriptor lets a launcher reacquire the same file after the
    /// Java premain handoff without violating Unix `fcntl` descriptor semantics.
    pub fn release(&mut self) -> Result<(), LockError> {
        if !self.held {
            return Ok(());
        }
        let file = self.file.as_ref().expect("live guard owns its file");
        platform::unlock(file).map_err(|source| LockError::UnlockOperation {
            path: self.path.clone(),
            source,
        })?;
        self.held = false;
        Ok(())
    }

    /// Tries to reacquire a previously released lock without waiting.
    ///
    /// Returns `false` while another process owns the range. It never opens a
    /// second descriptor and leaves the guard ready for another retry.
    pub fn try_reacquire(&mut self) -> Result<bool, LockError> {
        if self.held {
            return Ok(true);
        }
        let file = self.file.as_ref().expect("live guard owns its file");
        match platform::try_lock(file) {
            Ok(true) => {
                self.held = true;
                Ok(true)
            }
            Ok(false) => Ok(false),
            Err(source) => Err(LockError::LockOperation {
                path: self.path.clone(),
                source,
            }),
        }
    }
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        if self.held {
            if let Some(file) = self.file.as_ref() {
                let _ = platform::unlock(file);
            }
        }
        drop(self.file.take());
        registry::release(&self.path);
    }
}
