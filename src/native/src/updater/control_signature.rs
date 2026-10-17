use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

pub(super) const CONTROL_MAX_BYTES: usize = 16 * 1024;
pub(super) const SIGNATURE_MAX_BYTES: usize = 1024;

pub(super) const MANIFEST_PUBLIC_KEY: [u8; 32] = [
    0x3a, 0xb5, 0x0a, 0x30, 0x54, 0x2b, 0x06, 0xa5, 0xaa, 0xf6, 0xeb, 0x5e, 0xbf, 0x94, 0x1b, 0xd5,
    0xb8, 0x09, 0xda, 0x58, 0x9b, 0x91, 0x8b, 0x8b, 0x66, 0xc9, 0xe1, 0x3c, 0xe0, 0xf0, 0x17, 0xc1,
];

pub(super) fn verify_embedded_control_signature(
    raw: &str,
    raw_signature: &str,
) -> Result<(), String> {
    verify_control_signature_with_key(raw, raw_signature, &MANIFEST_PUBLIC_KEY)
}

pub(super) fn verify_control_signature_with_key(
    raw: &str,
    raw_signature: &str,
    public_key: &[u8; 32],
) -> Result<(), String> {
    if raw.len() > CONTROL_MAX_BYTES || raw_signature.len() > SIGNATURE_MAX_BYTES {
        return Err("Tauri update control is too large".to_owned());
    }
    let signature_bytes = STANDARD
        .decode(raw_signature.trim())
        .map_err(|_| "Tauri update control signature is invalid".to_owned())?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Tauri update control signature is invalid".to_owned())?;
    let key = VerifyingKey::from_bytes(public_key)
        .map_err(|_| "Tauri update trust key is invalid".to_owned())?;
    key.verify(raw.as_bytes(), &signature)
        .map_err(|_| "Tauri update control signature verification failed".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{verify_control_signature_with_key, verify_embedded_control_signature};
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn accepts_the_matching_control_signer_and_rejects_a_wrong_signer() {
        let raw = r#"{"schemaVersion":1,"repository":"Alex-dev-sys/NatuxWorld"}"#;
        let signing_key = SigningKey::from_bytes(&[42; 32]);
        let wrong_signing_key = SigningKey::from_bytes(&[43; 32]);
        let signature = STANDARD.encode(signing_key.sign(raw.as_bytes()).to_bytes());

        assert!(verify_control_signature_with_key(
            raw,
            &signature,
            signing_key.verifying_key().as_bytes(),
        )
        .is_ok());
        assert!(verify_embedded_control_signature(raw, &signature).is_err());
        assert_eq!(
            verify_control_signature_with_key(
                raw,
                &signature,
                wrong_signing_key.verifying_key().as_bytes(),
            )
            .unwrap_err(),
            "Tauri update control signature verification failed"
        );
    }
}
