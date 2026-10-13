use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use reqwest::{Response, StatusCode};
use sha1::{Digest, Sha1};
use sha2::Sha256;

use crate::cancellation::CancellationToken;

use super::file_ops::{destination_key, reject_unsafe_existing_target};
use super::policy::{MAX_REDIRECTS, MIN_RESUME_BYTES};
use super::types::{DownloadError, DownloadJob, ProgressState};
use super::{is_redirect, map_request_error, DownloadService};

impl DownloadService {
    pub(super) async fn fetch_to_file(
        &self,
        job: &DownloadJob,
        target: &Path,
        progress: &ProgressState,
        job_progress: &std::sync::atomic::AtomicU64,
        cancellation: &CancellationToken,
    ) -> Result<u64, DownloadError> {
        let partial = partial_path(target, &job.destination);
        let result = self
            .write_partial(job, &partial, progress, job_progress, cancellation)
            .await;
        let bytes_written = match result {
            Ok(bytes_written) => bytes_written,
            Err(error) => {
                discard_unusable_partial(&partial, job, &error, self.max_file_size);
                return Err(error);
            }
        };

        if cancellation.is_cancelled() {
            discard_unusable_partial(&partial, job, &DownloadError::Cancelled, self.max_file_size);
            return Err(DownloadError::Cancelled);
        }
        if let Err(error) = verify_complete_file(&partial, bytes_written, job) {
            discard_unusable_partial(&partial, job, &error, self.max_file_size);
            return Err(error);
        }
        reject_unsafe_existing_target(&self.root, target)?;
        fs::rename(&partial, target).map_err(|_| DownloadError::Io)?;
        Ok(bytes_written)
    }

    async fn write_partial(
        &self,
        job: &DownloadJob,
        partial: &Path,
        progress: &ProgressState,
        job_progress: &std::sync::atomic::AtomicU64,
        cancellation: &CancellationToken,
    ) -> Result<u64, DownloadError> {
        let mut resume_from = usable_partial_size(&self.root, partial, job, self.max_file_size)?;
        let mut response = self
            .fetch_response(job, cancellation, (resume_from > 0).then_some(resume_from))
            .await?;

        if resume_from > 0 {
            match response.status() {
                StatusCode::PARTIAL_CONTENT => {
                    if !range_response_matches(
                        &response,
                        resume_from,
                        job.expected_size,
                        self.max_file_size,
                    )? {
                        drop(response);
                        remove_partial(partial)?;
                        resume_from = 0;
                        response = self.fetch_response(job, cancellation, None).await?;
                    }
                }
                StatusCode::OK => resume_from = 0,
                StatusCode::RANGE_NOT_SATISFIABLE => {
                    drop(response);
                    remove_partial(partial)?;
                    resume_from = 0;
                    response = self.fetch_response(job, cancellation, None).await?;
                }
                _ => unreachable!("fetch_response validates ranged response status"),
            }
        }

        let expected_body_size = job
            .expected_size
            .map(|size| size.saturating_sub(resume_from));
        validate_content_length(&response, expected_body_size, self.max_file_size)?;
        let mut output = open_partial(&self.root, partial, resume_from)?;
        let mut bytes_written = resume_from;
        loop {
            let next_chunk = tokio::select! {
                _ = cancellation.cancelled() => {
                    persist_partial(&mut output)?;
                    return Err(DownloadError::Cancelled);
                },
                result = tokio::time::timeout(self.idle_timeout, response.chunk()) => {
                    match result {
                        Err(_) => {
                            persist_partial(&mut output)?;
                            return Err(DownloadError::Timeout);
                        }
                        Ok(Err(error)) => {
                            let error = map_request_error(error);
                            if matches!(error, DownloadError::Network(_) | DownloadError::Timeout) {
                                persist_partial(&mut output)?;
                            }
                            return Err(error);
                        }
                        Ok(Ok(chunk)) => chunk,
                    }
                }
            };
            let Some(chunk) = next_chunk else { break };
            bytes_written = bytes_written
                .checked_add(chunk.len() as u64)
                .ok_or(DownloadError::SizeLimitExceeded)?;
            if bytes_written > self.max_file_size {
                return Err(DownloadError::SizeLimitExceeded);
            }
            if job.expected_size.is_some_and(|size| bytes_written > size) {
                return Err(DownloadError::SizeMismatch);
            }
            output.write_all(&chunk).map_err(|_| DownloadError::Io)?;
            self.report_progress(job, bytes_written, progress, job_progress, false)
                .await;
        }
        if cancellation.is_cancelled() {
            return Err(DownloadError::Cancelled);
        }
        output.flush().map_err(|_| DownloadError::Io)?;
        output.sync_all().map_err(|_| DownloadError::Io)?;
        if job.expected_size.is_some_and(|size| size != bytes_written) {
            return Err(DownloadError::SizeMismatch);
        }
        Ok(bytes_written)
    }

    async fn fetch_response(
        &self,
        job: &DownloadJob,
        cancellation: &CancellationToken,
        range_start: Option<u64>,
    ) -> Result<Response, DownloadError> {
        let mut current = self.validate_url(&job.url)?;
        for redirect_count in 0..=MAX_REDIRECTS {
            let mut request = self.client.get(current.clone());
            if let Some(start) = range_start {
                request = request.header(reqwest::header::RANGE, format!("bytes={start}-"));
            }
            let candidate = tokio::select! {
                _ = cancellation.cancelled() => return Err(DownloadError::Cancelled),
                result = tokio::time::timeout(self.idle_timeout, request.send()) => {
                    match result {
                        Err(_) => return Err(DownloadError::Timeout),
                        Ok(result) => result.map_err(map_request_error)?,
                    }
                }
            };
            if is_redirect(candidate.status()) {
                if redirect_count == MAX_REDIRECTS {
                    return Err(DownloadError::TooManyRedirects);
                }
                let location = candidate
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or(DownloadError::InvalidUrl)?;
                let next = current
                    .join(location)
                    .map_err(|_| DownloadError::InvalidUrl)?;
                current = self.validate_url(next.as_str())?;
                continue;
            }

            let status = candidate.status();
            let acceptable = match range_start {
                Some(_) => matches!(
                    status,
                    StatusCode::OK
                        | StatusCode::PARTIAL_CONTENT
                        | StatusCode::RANGE_NOT_SATISFIABLE
                ),
                None => status == StatusCode::OK,
            };
            if !acceptable {
                return Err(DownloadError::HttpStatus(status.as_u16()));
            }
            return Ok(candidate);
        }
        Err(DownloadError::TooManyRedirects)
    }
}

fn persist_partial(output: &mut File) -> Result<(), DownloadError> {
    output.flush().map_err(|_| DownloadError::Io)?;
    output.sync_all().map_err(|_| DownloadError::Io)
}

pub(super) fn partial_path(target: &Path, destination: &Path) -> PathBuf {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let key = destination_key(destination);
    let digest = Sha256::digest(key.to_string_lossy().as_bytes());
    parent.join(format!(".natux-download-{digest:x}.part"))
}

fn usable_partial_size(
    root: &Path,
    partial: &Path,
    job: &DownloadJob,
    max_file_size: u64,
) -> Result<u64, DownloadError> {
    reject_unsafe_existing_target(root, partial)?;
    let metadata = match fs::symlink_metadata(partial) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(_) => return Err(DownloadError::Io),
    };
    let size = metadata.len();
    let resumable = metadata.is_file()
        && size >= MIN_RESUME_BYTES
        && size < max_file_size
        && job.expected_size.is_none_or(|expected| size < expected);
    if resumable {
        Ok(size)
    } else {
        remove_partial(partial)?;
        Ok(0)
    }
}

fn open_partial(root: &Path, partial: &Path, append: u64) -> Result<File, DownloadError> {
    reject_unsafe_existing_target(root, partial)?;
    let mut options = OpenOptions::new();
    options.write(true).create(true);
    if append > 0 {
        options.append(true);
    } else {
        options.truncate(true);
    }
    let file = options.open(partial).map_err(|_| DownloadError::Io)?;
    if file.metadata().map_err(|_| DownloadError::Io)?.len() != append {
        return Err(DownloadError::Io);
    }
    Ok(file)
}

fn range_response_matches(
    response: &Response,
    requested_start: u64,
    expected_size: Option<u64>,
    max_file_size: u64,
) -> Result<bool, DownloadError> {
    let Some(header) = response.headers().get(reqwest::header::CONTENT_RANGE) else {
        return Ok(false);
    };
    let Ok(header) = header.to_str() else {
        return Ok(false);
    };
    let Some((start, end, total)) = parse_content_range(header) else {
        return Ok(false);
    };
    if total > max_file_size {
        return Err(DownloadError::SizeLimitExceeded);
    }
    let remaining = total.saturating_sub(requested_start);
    Ok(start == requested_start
        && end.checked_add(1) == Some(total)
        && total > requested_start
        && expected_size.is_none_or(|expected| expected == total)
        && response
            .content_length()
            .is_none_or(|length| length == remaining))
}

fn parse_content_range(value: &str) -> Option<(u64, u64, u64)> {
    let (unit, range) = value.split_once(' ')?;
    if !unit.eq_ignore_ascii_case("bytes") {
        return None;
    }
    let (range, total) = range.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    Some((start.parse().ok()?, end.parse().ok()?, total.parse().ok()?))
}

fn validate_content_length(
    response: &Response,
    expected_body_size: Option<u64>,
    max_file_size: u64,
) -> Result<(), DownloadError> {
    if let Some(length) = response.content_length() {
        if length > max_file_size {
            return Err(DownloadError::SizeLimitExceeded);
        }
        if expected_body_size.is_some_and(|expected| expected != length) {
            return Err(DownloadError::SizeMismatch);
        }
    }
    Ok(())
}

fn verify_complete_file(
    path: &Path,
    expected_size: u64,
    job: &DownloadJob,
) -> Result<(), DownloadError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| DownloadError::Io)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(DownloadError::UnsafeDestination);
    }
    if metadata.len() != expected_size
        || job.expected_size.is_some_and(|size| size != expected_size)
    {
        return Err(DownloadError::SizeMismatch);
    }

    let mut file = File::open(path).map_err(|_| DownloadError::Io)?;
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|_| DownloadError::Io)?;
        if count == 0 {
            break;
        }
        sha1.update(&buffer[..count]);
        sha256.update(&buffer[..count]);
    }
    if job
        .expected_sha1
        .as_deref()
        .is_some_and(|expected| format!("{:x}", sha1.finalize()) != expected)
    {
        return Err(DownloadError::Sha1Mismatch);
    }
    if job
        .expected_sha256
        .as_deref()
        .is_some_and(|expected| format!("{:x}", sha256.finalize()) != expected)
    {
        return Err(DownloadError::Sha256Mismatch);
    }
    Ok(())
}

fn discard_unusable_partial(
    path: &Path,
    job: &DownloadJob,
    error: &DownloadError,
    max_file_size: u64,
) {
    if matches!(
        error,
        DownloadError::SizeLimitExceeded
            | DownloadError::SizeMismatch
            | DownloadError::Sha1Mismatch
            | DownloadError::Sha256Mismatch
    ) {
        let _ = remove_partial(path);
        return;
    }
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return;
    };
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() < MIN_RESUME_BYTES
        || metadata.len() >= max_file_size
        || job
            .expected_size
            .is_some_and(|expected| metadata.len() >= expected)
    {
        let _ = remove_partial(path);
    }
}

fn remove_partial(path: &Path) -> Result<(), DownloadError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(DownloadError::Io),
    }
}
