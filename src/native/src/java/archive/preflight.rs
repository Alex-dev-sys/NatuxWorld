use std::fs::File;
use std::io::Read;
use std::path::Path;

use flate2::read::GzDecoder;

use super::{io_message, Limits};

const MAX_TAR_EXTENSION_BYTES: u64 = 64 * 1024;
const MAX_TAR_EXTENSION_TOTAL: u64 = 16 * 1024 * 1024;
const TAR_BLOCK_BYTES: u64 = 512;
const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;

pub(super) fn preflight_tar_gz(
    path: &Path,
    limits: Limits,
    is_cancelled: &mut dyn FnMut() -> bool,
) -> Result<(), String> {
    let file = File::open(path).map_err(io_message)?;
    let mut reader = GzDecoder::new(file);
    let mut entries = 0_usize;
    let mut expanded = 0_u64;
    let mut stream_bytes = 0_u64;
    let mut extension_bytes = 0_u64;
    loop {
        check_cancelled(is_cancelled)?;
        let mut header = [0_u8; TAR_BLOCK_BYTES as usize];
        let mut filled = 0;
        while filled < header.len() {
            check_cancelled(is_cancelled)?;
            let count = reader.read(&mut header[filled..]).map_err(io_message)?;
            if count == 0 {
                if filled == 0 {
                    return Ok(());
                }
                return Err("truncated Java TAR header".to_owned());
            }
            filled += count;
        }
        stream_bytes = stream_bytes
            .checked_add(TAR_BLOCK_BYTES)
            .ok_or_else(|| "Java TAR expanded size overflow".to_owned())?;
        if header.iter().all(|byte| *byte == 0) {
            return Ok(());
        }
        entries += 1;
        if entries > limits.entries {
            return Err("Java TAR contains too many entries".to_owned());
        }
        let size = parse_octal_size(&header[124..136])?;
        let kind = header[156];
        let gnu_name_extension = matches!(kind, b'L' | b'K');
        let pax_extension = matches!(kind, b'x' | b'g');
        let extension = gnu_name_extension || pax_extension;
        if extension {
            if size > MAX_TAR_EXTENSION_BYTES {
                return Err("Java TAR path metadata is too large".to_owned());
            }
            extension_bytes = extension_bytes
                .checked_add(size)
                .ok_or_else(|| "Java TAR metadata size overflow".to_owned())?;
            if extension_bytes > MAX_TAR_EXTENSION_TOTAL {
                return Err("Java TAR path metadata exceeds the size limit".to_owned());
            }
            let mut body = vec![0; size as usize];
            read_exact_cancelable(&mut reader, &mut body, is_cancelled)?;
            if pax_extension {
                validate_tar_extension(&body)?;
            }
        } else if matches!(kind, 0 | b'0' | b'7') {
            reserve_size(size, &mut expanded, limits)?;
            skip_exact(&mut reader, size, is_cancelled)?;
        } else if matches!(kind, b'1' | b'2' | b'5') {
            if size != 0 {
                return Err("Java TAR link or directory has unexpected file data".to_owned());
            }
        } else {
            return Err("Java TAR contains an unsupported special file".to_owned());
        }
        let padding = (TAR_BLOCK_BYTES - size % TAR_BLOCK_BYTES) % TAR_BLOCK_BYTES;
        if extension || matches!(kind, 0 | b'0' | b'7') {
            skip_exact(&mut reader, padding, is_cancelled)?;
        }
        stream_bytes = stream_bytes
            .checked_add(size)
            .and_then(|value| value.checked_add(padding))
            .ok_or_else(|| "Java TAR expanded size overflow".to_owned())?;
        let stream_limit = limits
            .expanded_bytes
            .saturating_add((limits.entries as u64).saturating_mul(TAR_BLOCK_BYTES))
            .saturating_add(MAX_TAR_EXTENSION_TOTAL);
        if stream_bytes > stream_limit {
            return Err("Java TAR stream exceeds the size limit".to_owned());
        }
    }
}

fn validate_tar_extension(body: &[u8]) -> Result<(), String> {
    if body.last().is_some_and(|last| *last != 0 && *last != b'\n') {
        return Err("Java TAR extension metadata is malformed".to_owned());
    }
    for line in body.split(|byte| *byte == b'\n') {
        if line.is_empty() {
            continue;
        }
        let separator = line
            .iter()
            .position(|byte| *byte == b' ')
            .ok_or_else(|| "Java TAR extension metadata is malformed".to_owned())?;
        let declared = std::str::from_utf8(&line[..separator])
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .ok_or_else(|| "Java TAR extension length is invalid".to_owned())?;
        if declared != line.len() + 1 {
            return Err("Java TAR extension length is inconsistent".to_owned());
        }
        let field = std::str::from_utf8(&line[separator + 1..])
            .map_err(|_| "Java TAR extension metadata is not UTF-8".to_owned())?;
        if field.starts_with("size=") || field.starts_with("GNU.sparse.") {
            return Err("Java TAR size overrides and sparse entries are not supported".to_owned());
        }
    }
    Ok(())
}

fn parse_octal_size(bytes: &[u8]) -> Result<u64, String> {
    if bytes.first().is_some_and(|byte| byte & 0x80 != 0) {
        return Err("Java TAR uses an unsupported binary size field".to_owned());
    }
    let value = bytes
        .iter()
        .copied()
        .take_while(|byte| *byte != 0)
        .collect::<Vec<_>>();
    let value = std::str::from_utf8(&value)
        .map_err(|_| "Java TAR size field is invalid".to_owned())?
        .trim();
    if value.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(value, 8).map_err(|_| "Java TAR size field is invalid".to_owned())
}

fn read_exact_cancelable(
    reader: &mut impl Read,
    buffer: &mut [u8],
    is_cancelled: &mut dyn FnMut() -> bool,
) -> Result<(), String> {
    let mut filled = 0;
    while filled < buffer.len() {
        check_cancelled(is_cancelled)?;
        let count = reader.read(&mut buffer[filled..]).map_err(io_message)?;
        if count == 0 {
            return Err("truncated Java TAR extension data".to_owned());
        }
        filled += count;
    }
    Ok(())
}

fn skip_exact(
    reader: &mut impl Read,
    mut bytes: u64,
    is_cancelled: &mut dyn FnMut() -> bool,
) -> Result<(), String> {
    let mut buffer = [0_u8; 8192];
    while bytes > 0 {
        check_cancelled(is_cancelled)?;
        let amount = usize::try_from(bytes.min(buffer.len() as u64))
            .map_err(|_| "Java TAR size conversion failed".to_owned())?;
        let read = reader.read(&mut buffer[..amount]).map_err(io_message)?;
        if read == 0 {
            return Err("truncated Java TAR data".to_owned());
        }
        bytes -= read as u64;
    }
    Ok(())
}

fn check_cancelled(is_cancelled: &mut dyn FnMut() -> bool) -> Result<(), String> {
    if is_cancelled() {
        Err("Отменено".to_owned())
    } else {
        Ok(())
    }
}

fn reserve_size(size: u64, total: &mut u64, limits: Limits) -> Result<(), String> {
    if size > MAX_ENTRY_BYTES {
        return Err("Java archive contains an oversized entry".to_owned());
    }
    *total = total
        .checked_add(size)
        .ok_or_else(|| "Java archive expanded size overflow".to_owned())?;
    if *total > limits.expanded_bytes {
        return Err("Java archive expanded data exceeds the size limit".to_owned());
    }
    Ok(())
}
