//! Restricted file downloads for the native launcher pipeline.
//!
//! This module is intentionally not exposed as a Tauri command. Callers must
//! supply relative destinations and a URL on a host trusted by Rust code.
//! Verified partial files can resume through HTTP Range; cancellation keeps only
//! sufficiently large partials for a later retry.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, Instant};

use futures_util::future::join_all;
use reqwest::redirect::Policy;
use reqwest::{Client, StatusCode, Url};
use tokio::sync::{Mutex as AsyncMutex, Semaphore};

use crate::cancellation::CancellationToken;

mod file_ops;
mod policy;
mod transfer;
mod types;
use self::file_ops::{
    destination_key, matching_cached_file, normalize_allowed_hosts, prepare_destination,
    validate_relative_destination,
};
pub use self::policy::DEFAULT_ALLOWED_HOSTS;
use self::policy::{
    CONNECT_TIMEOUT, DEFAULT_CONCURRENCY, DEFAULT_MAX_FILE_SIZE, MAX_CONCURRENCY, MAX_RETRIES,
    PROGRESS_INTERVAL, REQUEST_TIMEOUT,
};
use self::types::ProgressState;
pub(crate) use self::types::{DownloadError, DownloadJob, NetworkFailureKind};

pub struct DownloadService {
    root: PathBuf,
    allowed_hosts: HashSet<String>,
    max_file_size: u64,
    idle_timeout: Duration,
    allow_loopback_http: bool,
    client: Client,
    concurrency: Arc<Semaphore>,
    destination_locks: Mutex<HashMap<PathBuf, Weak<AsyncMutex<()>>>>,
}

impl DownloadService {
    /// Creates a service using the built-in Mojang and approved installer hosts.
    pub fn new(root: impl AsRef<Path>) -> Result<Self, DownloadError> {
        Self::with_policy(
            root,
            DEFAULT_ALLOWED_HOSTS.iter().copied(),
            DEFAULT_CONCURRENCY,
            DEFAULT_MAX_FILE_SIZE,
        )
    }

    /// Allows native pipeline code to provide a narrower host set or size cap.
    /// This API is Rust-only; it must not be wired to renderer-controlled input.
    pub fn with_policy<I, S>(
        root: impl AsRef<Path>,
        allowed_hosts: I,
        max_concurrent: usize,
        max_file_size: u64,
    ) -> Result<Self, DownloadError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        Self::build(root, allowed_hosts, max_concurrent, max_file_size, false)
    }

    fn build<I, S>(
        root: impl AsRef<Path>,
        allowed_hosts: I,
        max_concurrent: usize,
        max_file_size: u64,
        allow_loopback_http: bool,
    ) -> Result<Self, DownloadError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        if max_file_size == 0 {
            return Err(DownloadError::InvalidPolicy);
        }
        let allowed_hosts = normalize_allowed_hosts(allowed_hosts, allow_loopback_http)?;
        if allowed_hosts.is_empty() {
            return Err(DownloadError::InvalidPolicy);
        }

        fs::create_dir_all(root.as_ref()).map_err(|_| DownloadError::Io)?;
        let root = fs::canonicalize(root.as_ref()).map_err(|_| DownloadError::Io)?;
        if !root.is_dir() {
            return Err(DownloadError::InvalidPolicy);
        }
        let client = Client::builder()
            .redirect(Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .https_only(!allow_loopback_http)
            .user_agent("NatuxWorldLauncher")
            .build()
            .map_err(|_| DownloadError::InvalidPolicy)?;

        Ok(Self {
            root,
            allowed_hosts,
            max_file_size,
            idle_timeout: REQUEST_TIMEOUT,
            allow_loopback_http,
            client,
            concurrency: Arc::new(Semaphore::new(max_concurrent.clamp(1, MAX_CONCURRENCY))),
            destination_locks: Mutex::new(HashMap::new()),
        })
    }

    /// Downloads distinct jobs with bounded concurrency and aggregate progress.
    /// Existing files are reused only after their expected hash and size match.
    pub async fn download_many<F>(
        &self,
        jobs: Vec<DownloadJob>,
        on_progress: F,
    ) -> Result<(), DownloadError>
    where
        F: Fn(u64, u64, &Path) + Send + Sync + 'static,
    {
        self.download_many_cancelable(jobs, CancellationToken::default(), on_progress)
            .await
    }

    /// Downloads distinct jobs and stops outstanding HTTP and filesystem work when cancelled.
    pub async fn download_many_cancelable<F>(
        &self,
        jobs: Vec<DownloadJob>,
        cancellation: CancellationToken,
        on_progress: F,
    ) -> Result<(), DownloadError>
    where
        F: Fn(u64, u64, &Path) + Send + Sync + 'static,
    {
        if cancellation.is_cancelled() {
            return Err(DownloadError::Cancelled);
        }
        let jobs = self.validate_and_dedupe(jobs)?;
        let total = jobs
            .iter()
            .try_fold(0_u64, |sum, job| {
                sum.checked_add(job.expected_size.unwrap_or(0))
            })
            .ok_or(DownloadError::SizeLimitExceeded)?;
        let progress = Arc::new(ProgressState {
            total,
            completed: std::sync::atomic::AtomicU64::new(0),
            callback_lock: AsyncMutex::new(()),
            last_callback: Mutex::new(Instant::now()),
            callback: Arc::new(on_progress),
        });
        let tasks = jobs
            .into_iter()
            .map(|job| {
                let lock = self.destination_lock(&job.destination)?;
                let progress = Arc::clone(&progress);
                let job_progress = Arc::new(std::sync::atomic::AtomicU64::new(0));
                let cancellation = cancellation.clone();
                Ok(async move {
                    let _destination_guard = tokio::select! {
                        _ = cancellation.cancelled() => return Err(DownloadError::Cancelled),
                        guard = lock.lock() => guard,
                    };
                    let _permit = tokio::select! {
                        _ = cancellation.cancelled() => return Err(DownloadError::Cancelled),
                        permit = self.concurrency.clone().acquire_owned() => {
                            permit.map_err(|_| DownloadError::LockUnavailable)?
                        },
                    };
                    self.download_one(&job, &progress, &job_progress, &cancellation)
                        .await?;
                    Ok::<(), DownloadError>(())
                })
            })
            .collect::<Result<Vec<_>, DownloadError>>()?;

        let mut first_error = None;
        for result in join_all(tasks).await {
            if first_error.is_none() {
                first_error = result.err();
            }
        }
        first_error.map_or(Ok(()), Err)
    }

    fn validate_and_dedupe(
        &self,
        jobs: Vec<DownloadJob>,
    ) -> Result<Vec<DownloadJob>, DownloadError> {
        let mut unique = HashMap::<PathBuf, DownloadJob>::new();
        for mut job in jobs {
            validate_relative_destination(&job.destination)?;
            let url = self.validate_url(&job.url)?;
            job.url = url.to_string();
            if job
                .expected_size
                .is_some_and(|size| size > self.max_file_size)
            {
                return Err(DownloadError::SizeLimitExceeded);
            }
            if let Some(hash) = &mut job.expected_sha1 {
                if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err(DownloadError::InvalidPolicy);
                }
                hash.make_ascii_lowercase();
            }
            if let Some(hash) = &mut job.expected_sha256 {
                if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err(DownloadError::InvalidPolicy);
                }
                hash.make_ascii_lowercase();
            }
            let key = destination_key(&job.destination);
            if let Some(existing) = unique.get(&key) {
                if existing.url != job.url
                    || existing.expected_sha1 != job.expected_sha1
                    || existing.expected_sha256 != job.expected_sha256
                    || existing.expected_size != job.expected_size
                {
                    return Err(DownloadError::ConflictingDestination);
                }
            } else {
                unique.insert(key, job);
            }
        }
        Ok(unique.into_values().collect())
    }

    fn validate_url(&self, raw: &str) -> Result<Url, DownloadError> {
        let url = Url::parse(raw).map_err(|_| DownloadError::InvalidUrl)?;
        if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
            return Err(DownloadError::InvalidUrl);
        }
        let host = url.host_str().ok_or(DownloadError::InvalidUrl)?;
        if host.ends_with('.') {
            return Err(DownloadError::InvalidUrl);
        }
        let is_loopback = host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or_else(|_| host.eq_ignore_ascii_case("localhost"));
        let test_http = self.allow_loopback_http
            && url.scheme() == "http"
            && is_loopback
            && url.port().is_some();
        if url.scheme() != "https" && !test_http {
            return Err(DownloadError::UnsafeProtocol);
        }
        if url.scheme() == "https" && url.port_or_known_default() != Some(443) {
            return Err(DownloadError::InvalidUrl);
        }
        if host.parse::<IpAddr>().is_ok() && !test_http {
            return Err(DownloadError::UntrustedHost);
        }
        if !self.allowed_hosts.contains(&host.to_ascii_lowercase()) {
            return Err(DownloadError::UntrustedHost);
        }
        Ok(url)
    }

    fn destination_lock(&self, destination: &Path) -> Result<Arc<AsyncMutex<()>>, DownloadError> {
        let key = destination_key(destination);
        let mut locks = self
            .destination_locks
            .lock()
            .map_err(|_| DownloadError::LockUnavailable)?;
        locks.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
            return Ok(lock);
        }
        let lock = Arc::new(AsyncMutex::new(()));
        locks.insert(key, Arc::downgrade(&lock));
        Ok(lock)
    }

    async fn download_one(
        &self,
        job: &DownloadJob,
        progress: &ProgressState,
        job_progress: &std::sync::atomic::AtomicU64,
        cancellation: &CancellationToken,
    ) -> Result<u64, DownloadError> {
        if cancellation.is_cancelled() {
            return Err(DownloadError::Cancelled);
        }
        let target = prepare_destination(&self.root, &job.destination)?;
        if let Some(size) = matching_cached_file(&target, job)? {
            self.report_progress(job, size, progress, job_progress, true)
                .await;
            return Ok(size);
        }

        let mut last_error = DownloadError::Network(NetworkFailureKind::Unknown);
        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                self.report_progress(job, 0, progress, job_progress, true)
                    .await;
            }
            match self
                .fetch_to_file(job, &target, progress, job_progress, cancellation)
                .await
            {
                Ok(bytes) => {
                    self.report_progress(job, bytes, progress, job_progress, true)
                        .await;
                    return Ok(bytes);
                }
                Err(error) if is_retryable(&error) && attempt + 1 < MAX_RETRIES => {
                    last_error = error;
                    tokio::select! {
                        _ = cancellation.cancelled() => return Err(DownloadError::Cancelled),
                        _ = tokio::time::sleep(Duration::from_millis(500_u64 << attempt)) => {},
                    }
                }
                Err(error) => return Err(error),
            }
        }
        Err(last_error)
    }

    async fn report_progress(
        &self,
        job: &DownloadJob,
        current_file_bytes: u64,
        progress: &ProgressState,
        job_progress: &std::sync::atomic::AtomicU64,
        force: bool,
    ) {
        if job.expected_size.is_none() {
            return;
        }
        let _guard = progress.callback_lock.lock().await;
        let previous = job_progress.swap(current_file_bytes, std::sync::atomic::Ordering::Relaxed);
        let completed = progress
            .completed
            .load(std::sync::atomic::Ordering::Relaxed);
        let completed = completed
            .saturating_sub(previous)
            .saturating_add(current_file_bytes);
        progress
            .completed
            .store(completed, std::sync::atomic::Ordering::Relaxed);
        let now = Instant::now();
        let should_emit = {
            let mut last_callback = progress
                .last_callback
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let required = force
                && (current_file_bytes == 0 || (progress.total > 0 && completed >= progress.total));
            if required || now.duration_since(*last_callback) >= PROGRESS_INTERVAL {
                *last_callback = now;
                true
            } else {
                false
            }
        };
        if should_emit {
            (progress.callback)(completed, progress.total, &job.destination);
        }
    }
}

fn is_redirect(status: StatusCode) -> bool {
    matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308)
}

fn map_request_error(error: reqwest::Error) -> DownloadError {
    if error.is_timeout() {
        DownloadError::Timeout
    } else if error.is_dns() {
        DownloadError::Network(NetworkFailureKind::Dns)
    } else if error.is_connect() {
        DownloadError::Network(NetworkFailureKind::Connection)
    } else if error.is_body() || error.is_decode() {
        DownloadError::Network(NetworkFailureKind::Response)
    } else if error.is_request() {
        DownloadError::Network(NetworkFailureKind::Request)
    } else {
        DownloadError::Network(NetworkFailureKind::Unknown)
    }
}

fn is_retryable(error: &DownloadError) -> bool {
    matches!(error, DownloadError::Network(_) | DownloadError::Timeout)
        || matches!(error, DownloadError::HttpStatus(408 | 425 | 429))
        || matches!(error, DownloadError::HttpStatus(status) if (500..=599).contains(status))
}

#[cfg(test)]
#[path = "downloads/tests.rs"]
mod tests;
