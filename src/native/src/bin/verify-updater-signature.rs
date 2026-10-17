use std::env;
use std::error::Error;
use std::fs::File;
use std::io::{self, Read};
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde_json::Value;

fn main() {
    if let Err(error) = run() {
        eprintln!("Updater signature verification failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut args = env::args_os().skip(1);
    let artifact = PathBuf::from(args.next().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "usage: verify-updater-signature <artifact> <signature>",
        )
    })?);
    let signature_path = PathBuf::from(args.next().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "usage: verify-updater-signature <artifact> <signature>",
        )
    })?);
    if args.next().is_some() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "usage: verify-updater-signature <artifact> <signature>",
        )
        .into());
    }

    let config: Value = serde_json::from_slice(&std::fs::read("src/native/tauri.conf.json")?)?;
    let encoded_key = config
        .pointer("/plugins/updater/pubkey")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "Tauri updater pubkey is missing",
            )
        })?;
    let key_text = String::from_utf8(STANDARD.decode(encoded_key)?)?;
    let public_key = PublicKey::decode(&key_text)?;
    let signature_text = std::fs::read_to_string(&signature_path)?;
    let signature_text = String::from_utf8(STANDARD.decode(signature_text.trim())?)?;
    let signature = Signature::decode(&signature_text)?;
    let file = File::open(&artifact)?;
    verify_reader(file, &public_key, &signature)?;

    println!("Verified updater signature: {}", artifact.display());
    Ok(())
}

fn verify_reader<R: Read>(
    mut reader: R,
    public_key: &PublicKey,
    signature: &Signature,
) -> Result<(), minisign_verify::Error> {
    let mut verifier = public_key.verify_stream(signature)?;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(minisign_verify::Error::IoError)?;
        if count == 0 {
            break;
        }
        verifier.update(&buffer[..count]);
    }
    verifier.finalize()
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    const PUBLIC_KEY: &str = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==";

    #[test]
    fn streaming_verifier_accepts_the_signed_bytes_and_rejects_tampering() {
        let public_key = PublicKey::from_base64(PUBLIC_KEY).unwrap();
        let encoded_signature = STANDARD.encode(SIGNATURE.as_bytes());
        let decoded_signature =
            String::from_utf8(STANDARD.decode(encoded_signature).unwrap()).unwrap();
        let signature = Signature::decode(&decoded_signature).unwrap();

        assert!(verify_reader(Cursor::new(b"test"), &public_key, &signature).is_ok());
        assert!(verify_reader(Cursor::new(b"test!"), &public_key, &signature).is_err());
    }
}
