use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::Mutex as AsyncMutex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadError {
    InvalidPolicy,
    InvalidDestination,
    UnsafeDestination,
    InvalidUrl,
    UntrustedHost,
    UnsafeProtocol,
    TooManyRedirects,
    HttpStatus(u16),
    Timeout,
    Network(NetworkFailureKind),
    Cancelled,
    SizeLimitExceeded,
    SizeMismatch,
    Sha1Mismatch,
    Sha256Mismatch,
    ConflictingDestination,
    LockUnavailable,
    Io,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkFailureKind {
    Dns,
    Connection,
    Request,
    Response,
    Unknown,
}

impl fmt::Display for DownloadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidPolicy => "download policy is invalid",
            Self::InvalidDestination => "download destination must be a safe relative path",
            Self::UnsafeDestination => "download destination contains a symlink or unsafe path",
            Self::InvalidUrl => "download URL is invalid",
            Self::UntrustedHost => "download host is not allowlisted",
            Self::UnsafeProtocol => "only HTTPS downloads are permitted",
            Self::TooManyRedirects => "too many download redirects",
            Self::HttpStatus(_) => "download server returned an unsuccessful status",
            Self::Timeout => "download timed out",
            Self::Network(NetworkFailureKind::Dns) => "download host lookup failed",
            Self::Network(NetworkFailureKind::Connection) => "download connection failed",
            Self::Network(NetworkFailureKind::Request) => "download request failed",
            Self::Network(NetworkFailureKind::Response) => "download response failed",
            Self::Network(NetworkFailureKind::Unknown) => "download network request failed",
            Self::Cancelled => "download was cancelled",
            Self::SizeLimitExceeded => "download exceeds the configured size limit",
            Self::SizeMismatch => "download size does not match the expected size",
            Self::Sha1Mismatch => "download SHA-1 does not match the expected value",
            Self::Sha256Mismatch => "download SHA-256 does not match the expected value",
            Self::ConflictingDestination => "conflicting downloads target the same file",
            Self::LockUnavailable => "download service lock is unavailable",
            Self::Io => "download file operation failed",
        };
        if let Self::HttpStatus(status) = self {
            write!(formatter, "{message} ({status})")
        } else {
            formatter.write_str(message)
        }
    }
}

impl std::error::Error for DownloadError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadJob {
    pub url: String,
    /// Destination relative to the configured download root.
    pub destination: PathBuf,
    pub expected_sha1: Option<String>,
    pub expected_sha256: Option<String>,
    pub expected_size: Option<u64>,
}

pub(super) type ProgressCallback = Arc<dyn Fn(u64, u64, &Path) + Send + Sync + 'static>;

pub(super) struct ProgressState {
    pub total: u64,
    pub completed: std::sync::atomic::AtomicU64,
    pub callback_lock: AsyncMutex<()>,
    pub last_callback: std::sync::Mutex<Instant>,
    pub callback: ProgressCallback,
}
