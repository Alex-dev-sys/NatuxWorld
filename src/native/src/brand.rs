use std::sync::OnceLock;

use serde::Deserialize;
use url::{Host, Url};

const SOURCE: &str = include_str!("../../../config/launcher-brand.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BrandSource {
    name: String,
    site_origin: String,
    server_host: String,
    shop_path: String,
    minecraft_version_label: String,
    discord_client_id: String,
    local: LocalBrand,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalBrand {
    site_origin: String,
    server_host: String,
}

struct Brand {
    name: String,
    site_origin: String,
    origin: Url,
    server_host: String,
    discord_client_id: String,
    auth_api: String,
    crash_report_url: String,
    telemetry_url: String,
}

impl BrandSource {
    fn resolve(self, local: bool) -> Result<Brand, &'static str> {
        validate_label(&self.name)?;
        validate_label(&self.minecraft_version_label)?;
        if !self.shop_path.starts_with('/')
            || self.shop_path.starts_with("//")
            || self.shop_path.contains(['?', '#', '\\'])
        {
            return Err("invalid shop path in launcher brand");
        }
        if !self.discord_client_id.is_empty()
            && (!(17..=20).contains(&self.discord_client_id.len())
                || !self
                    .discord_client_id
                    .bytes()
                    .all(|byte| byte.is_ascii_digit())
                || self.discord_client_id.parse::<u64>().is_err())
        {
            return Err("invalid Discord application ID in launcher brand");
        }
        // Validate both profiles, including the one omitted from this build.
        let production_origin = validate_origin(&self.site_origin, false)?;
        let local_origin = validate_origin(&self.local.site_origin, true)?;
        validate_host(&self.server_host)?;
        validate_host(&self.local.server_host)?;
        let (origin, server_host) = if local {
            (local_origin, self.local.server_host)
        } else {
            (production_origin, self.server_host)
        };
        let site_origin = origin.origin().ascii_serialization();
        Ok(Brand {
            name: self.name,
            auth_api: format!("{site_origin}/api/auth"),
            crash_report_url: format!("{site_origin}/api/crash-report"),
            telemetry_url: format!("{site_origin}/api/launcher-events"),
            site_origin,
            origin,
            server_host,
            discord_client_id: self.discord_client_id,
        })
    }
}

fn validate_origin(raw: &str, local: bool) -> Result<Url, &'static str> {
    if raw.len() > 2048 || raw.trim() != raw || raw.chars().any(char::is_control) {
        return Err("invalid website origin in launcher brand");
    }
    let url = Url::parse(raw).map_err(|_| "invalid website origin in launcher brand")?;
    let allowed_scheme = if local {
        url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port().is_some()
    } else {
        url.scheme() == "https" && url.host_str().is_some()
    };
    if !allowed_scheme
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("launcher brand must use an HTTPS origin or local loopback origin");
    }
    Ok(url)
}

fn validate_label(value: &str) -> Result<(), &'static str> {
    if value.is_empty() || value.len() > 128 || value.chars().any(char::is_control) {
        Err("invalid label in launcher brand")
    } else {
        Ok(())
    }
}

fn validate_host(value: &str) -> Result<(), &'static str> {
    if value.is_empty()
        || value.len() > 253
        || value.contains(['/', '\\', ':', '@', '?', '#'])
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
        || Host::parse(value).is_err()
    {
        Err("invalid Minecraft host in launcher brand")
    } else {
        Ok(())
    }
}

fn active() -> &'static Brand {
    static BRAND: OnceLock<Brand> = OnceLock::new();
    BRAND.get_or_init(|| {
        serde_json::from_str::<BrandSource>(SOURCE)
            .expect("launcher-brand.json must be valid")
            .resolve(cfg!(natux_local_auth_api))
            .expect("launcher-brand.json must contain safe origins and labels")
    })
}

pub(crate) fn name() -> &'static str {
    &active().name
}
pub(crate) fn site_origin() -> &'static str {
    &active().site_origin
}
pub(crate) fn server_host() -> &'static str {
    &active().server_host
}
pub(crate) fn discord_client_id() -> &'static str {
    &active().discord_client_id
}
pub(crate) fn auth_api() -> &'static str {
    &active().auth_api
}
pub(crate) fn crash_report_url() -> &'static str {
    &active().crash_report_url
}
pub(crate) fn telemetry_url() -> &'static str {
    &active().telemetry_url
}

pub(crate) fn is_trusted_site_url(url: &Url) -> bool {
    trusted_origin(&active().origin, url)
}

fn trusted_origin(origin: &Url, url: &Url) -> bool {
    url.origin() == origin.origin()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_and_local_services_share_each_profiles_origin() {
        for local in [false, true] {
            let source = serde_json::from_str::<BrandSource>(SOURCE).unwrap();
            let expected_host = if local {
                source.local.server_host.clone()
            } else {
                source.server_host.clone()
            };
            let brand = source.resolve(local).unwrap();
            for endpoint in [
                &brand.auth_api,
                &brand.crash_report_url,
                &brand.telemetry_url,
            ] {
                assert!(trusted_origin(
                    &brand.origin,
                    &Url::parse(endpoint).unwrap()
                ));
            }
            assert_eq!(brand.origin.scheme(), if local { "http" } else { "https" });
            assert_eq!(brand.server_host, expected_host);
        }
    }

    #[test]
    fn configured_origin_is_exact_and_does_not_expand_network_trust() {
        let origin = validate_origin("https://launcher.example:8443", false).unwrap();
        assert!(trusted_origin(
            &origin,
            &Url::parse("https://launcher.example:8443/api/news").unwrap()
        ));
        for candidate in [
            "https://launcher.example/api/news",
            "http://launcher.example:8443/api/news",
            "https://sub.launcher.example:8443/api/news",
            "https://evil.example:8443/api/news",
            "https://user@launcher.example:8443/api/news",
            "https://launcher.example:8443/api/news?q=x",
        ] {
            assert!(!trusted_origin(&origin, &Url::parse(candidate).unwrap()));
        }
    }

    #[test]
    fn unsafe_build_origins_are_rejected() {
        for raw in [
            "http://example.com",
            "https://user:pass@example.com",
            "https://example.com/path",
            "https://example.com?token=x",
            "https://example.com#x",
            "file:///tmp/site",
            " https://example.com",
        ] {
            assert!(validate_origin(raw, false).is_err(), "{raw}");
        }
        assert!(validate_origin("http://example.com:3000", true).is_err());
        assert!(validate_origin("http://127.0.0.1", true).is_err());
    }
}
