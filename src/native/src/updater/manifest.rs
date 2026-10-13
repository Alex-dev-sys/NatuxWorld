use semver::Version;
use serde::Serialize;

use super::control_signature::{
    verify_control_signature_with_key, verify_embedded_control_signature,
};
use crate::settings::LauncherSettings;

pub(super) const REPOSITORY: &str = "Alex-dev-sys/NatuxWorld";
pub(super) use super::control_signature::{CONTROL_MAX_BYTES, SIGNATURE_MAX_BYTES};

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ControlManifest {
    pub(super) schema_version: u8,
    pub(super) repository: String,
    pub(super) channel: String,
    pub(super) version: String,
    pub(super) rollout_pct: u8,
    pub(super) feed_url: String,
    #[serde(default)]
    pub(super) migration_enabled: bool,
}

impl ControlManifest {
    pub(crate) fn version(&self) -> &str {
        &self.version
    }

    pub(crate) fn feed_url(&self) -> &str {
        &self.feed_url
    }
}

pub(super) fn verify_control(raw: &str, raw_signature: &str) -> Result<ControlManifest, String> {
    verify_embedded_control_signature(raw, raw_signature)?;
    serde_json::from_str(raw).map_err(|_| "Tauri update control is invalid JSON".to_owned())
}

pub(super) fn verify_control_with_key(
    raw: &str,
    raw_signature: &str,
    public_key: &[u8; 32],
) -> Result<(), String> {
    verify_control_signature_with_key(raw, raw_signature, public_key)
}

pub(super) fn validate_control(
    control: &ControlManifest,
    expected_channel: &str,
) -> Result<(), String> {
    if control.schema_version != 1 || control.repository != REPOSITORY {
        return Err("Tauri update control does not match this repository".to_owned());
    }
    if control.channel != expected_channel || !matches!(control.channel.as_str(), "stable" | "beta")
    {
        return Err("Tauri update control channel mismatch".to_owned());
    }
    let version = Version::parse(&control.version)
        .map_err(|_| "Tauri update control version is invalid".to_owned())?;
    if version.to_string() != control.version || control.rollout_pct > 100 {
        return Err("Tauri update control fields are invalid".to_owned());
    }
    let expected_feed = format!(
        "https://github.com/{REPOSITORY}/releases/download/v{}/latest.json",
        control.version
    );
    if control.feed_url != expected_feed {
        return Err("Tauri update feed URL does not match its signed version".to_owned());
    }
    Ok(())
}

pub(super) fn control_is_visible(
    control: &ControlManifest,
    settings: &LauncherSettings,
    current_version: &str,
) -> Result<bool, String> {
    validate_control(control, &settings.update_channel)?;
    let update_version = Version::parse(&control.version)
        .map_err(|_| "Tauri update control version is invalid".to_owned())?;
    let current = Version::parse(current_version)
        .map_err(|_| "Installed Tauri version is invalid".to_owned())?;
    if update_version <= current || control.rollout_pct == 0 {
        return Ok(false);
    }
    if control.rollout_pct == 100 {
        return Ok(true);
    }
    if uuid::Uuid::parse_str(&settings.install_id).is_err() {
        return Ok(false);
    }
    Ok(rollout_bucket(&settings.install_id, &control.version) < u32::from(control.rollout_pct))
}

fn rollout_bucket(install_id: &str, version: &str) -> u32 {
    let mut hash = 0x811c9dc5_u32;
    for byte in format!("{install_id}:{version}").bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(0x01000193);
    }
    hash % 100
}

#[cfg(test)]
mod tests {
    use super::{
        rollout_bucket, validate_control, verify_control_with_key, ControlManifest, REPOSITORY,
    };
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};

    fn control(channel: &str) -> ControlManifest {
        ControlManifest {
            schema_version: 1,
            repository: REPOSITORY.to_owned(),
            channel: channel.to_owned(),
            version: "1.9.16".to_owned(),
            rollout_pct: 25,
            migration_enabled: false,
            feed_url: format!(
                "https://github.com/{REPOSITORY}/releases/download/v1.9.16/latest.json"
            ),
        }
    }

    #[test]
    fn control_requires_repository_channel_version_and_exact_feed_url() {
        let stable = control("stable");
        assert!(validate_control(&stable, "stable").is_ok());
        assert!(validate_control(&stable, "beta").is_err());

        let mut wrong_repository = control("stable");
        wrong_repository.repository = "attacker/launcher".to_owned();
        assert!(validate_control(&wrong_repository, "stable").is_err());

        let mut wrong_url = control("stable");
        wrong_url.feed_url = "https://updates.invalid/latest.json".to_owned();
        assert!(validate_control(&wrong_url, "stable").is_err());

        let mut bad_version = control("stable");
        bad_version.version = "../latest".to_owned();
        assert!(validate_control(&bad_version, "stable").is_err());
    }

    #[test]
    fn migration_flag_defaults_off_for_existing_control_feeds() {
        let mut old = serde_json::to_value(control("stable")).expect("serialized control");
        old.as_object_mut()
            .expect("control object")
            .remove("migrationEnabled");
        let parsed: ControlManifest = serde_json::from_value(old).expect("legacy control parses");
        assert!(!parsed.migration_enabled);

        let mut enabled = control("stable");
        enabled.migration_enabled = true;
        let raw = serde_json::to_string(&enabled).expect("serialized control");
        let parsed: ControlManifest = serde_json::from_str(&raw).expect("migration control parses");
        assert!(parsed.migration_enabled);
    }

    #[test]
    fn rollout_bucket_is_deterministic_and_spreads_installations() {
        assert_eq!(
            rollout_bucket("00000000-0000-4000-8000-000000000001", "1.9.16"),
            15
        );
        let buckets: std::collections::HashSet<_> = (1..=100)
            .map(|n| rollout_bucket(&format!("00000000-0000-4000-8000-{n:012}"), "1.9.16"))
            .collect();
        assert!(buckets.len() > 50);
    }

    #[test]
    fn ed25519_control_signature_rejects_tampering() {
        let signing_key = SigningKey::from_bytes(&[42; 32]);
        let raw = r#"{"schemaVersion":1,"repository":"Alex-dev-sys/NatuxWorld","channel":"stable","version":"1.9.16","rolloutPct":25,"feedUrl":"https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/latest.json"}"#;
        let signature = STANDARD.encode(signing_key.sign(raw.as_bytes()).to_bytes());
        assert!(
            verify_control_with_key(raw, &signature, signing_key.verifying_key().as_bytes())
                .is_ok()
        );
        assert!(
            verify_control_with_key("{}", &signature, signing_key.verifying_key().as_bytes())
                .is_err()
        );
    }
}
