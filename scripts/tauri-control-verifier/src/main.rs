use std::env;
use std::error::Error;
use std::fs::File;
use std::io::{self, Read};
use std::path::PathBuf;

#[path = "../../../src/native/src/updater/control_signature.rs"]
mod control_signature;

fn main() {
    if let Err(error) = run() {
        eprintln!("Tauri control signature verification failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut args = env::args_os().skip(1);
    let manifest_path = PathBuf::from(args.next().ok_or_else(usage_error)?);
    let signature_path = PathBuf::from(args.next().ok_or_else(usage_error)?);
    if args.next().is_some() {
        return Err(usage_error().into());
    }

    let raw = read_small_text(&manifest_path, control_signature::CONTROL_MAX_BYTES)?;
    let signature = read_small_text(&signature_path, control_signature::SIGNATURE_MAX_BYTES)?;
    control_signature::verify_embedded_control_signature(&raw, &signature)?;
    println!("Verified Tauri control signature against the embedded launcher key.");
    Ok(())
}

fn usage_error() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "usage: verify-tauri-control-signature <manifest> <signature>",
    )
}

fn read_small_text(path: &PathBuf, max_bytes: usize) -> Result<String, Box<dyn Error>> {
    let mut bytes = Vec::new();
    File::open(path)?
        .take(max_bytes as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > max_bytes {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "input is too large").into());
    }
    Ok(String::from_utf8(bytes)?)
}
