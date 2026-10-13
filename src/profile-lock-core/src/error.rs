use std::fmt;
use std::io;
use std::path::PathBuf;

#[derive(Debug)]
pub enum LockError {
    InvalidPath(PathBuf),
    AlreadyOpenInProcess(PathBuf),
    ParentDirectory { path: PathBuf, source: io::Error },
    Open { path: PathBuf, source: io::Error },
    InvalidLockFile(PathBuf),
    LockOperation { path: PathBuf, source: io::Error },
    UnlockOperation { path: PathBuf, source: io::Error },
}

impl fmt::Display for LockError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPath(path) => write!(formatter, "invalid lock path: {}", path.display()),
            Self::AlreadyOpenInProcess(path) => write!(
                formatter,
                "lock file is already open in this process: {}",
                path.display()
            ),
            Self::ParentDirectory { path, source } => write!(
                formatter,
                "cannot prepare lock directory {}: {source}",
                path.display()
            ),
            Self::Open { path, source } => {
                write!(
                    formatter,
                    "cannot open lock file {}: {source}",
                    path.display()
                )
            }
            Self::InvalidLockFile(path) => write!(
                formatter,
                "lock path is not a single-link regular file: {}",
                path.display()
            ),
            Self::LockOperation { path, source } => {
                write!(formatter, "cannot lock {}: {source}", path.display())
            }
            Self::UnlockOperation { path, source } => {
                write!(formatter, "cannot unlock {}: {source}", path.display())
            }
        }
    }
}

impl std::error::Error for LockError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::ParentDirectory { source, .. }
            | Self::Open { source, .. }
            | Self::LockOperation { source, .. }
            | Self::UnlockOperation { source, .. } => Some(source),
            Self::InvalidPath(_) | Self::AlreadyOpenInProcess(_) | Self::InvalidLockFile(_) => None,
        }
    }
}
