use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::error::LockError;
use crate::normalize::prepare_identity;

static OPEN_LOCKS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

fn open_locks() -> &'static Mutex<HashSet<PathBuf>> {
    OPEN_LOCKS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) fn reserve(path: &Path) -> Result<PathBuf, LockError> {
    let identity = prepare_identity(path)?;
    let mut open = open_locks()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if !open.insert(identity.clone()) {
        return Err(LockError::AlreadyOpenInProcess(identity));
    }
    Ok(identity)
}

pub(crate) fn release(path: &Path) {
    let mut open = open_locks()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    open.remove(path);
}
