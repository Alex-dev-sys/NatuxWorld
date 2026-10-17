use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use keyring::Entry;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::{redirect::Policy, Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::AccountUser;

pub(super) const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
pub(super) const MAX_TOKEN_BYTES: usize = 8 * 1024;
pub(super) const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
const APP_CREDENTIAL_SERVICE: &str = "world.natux.launcher";
const ACCOUNT_CREDENTIAL_NAME: &str = "account-session";

#[derive(Deserialize, Serialize)]
pub(super) struct CredentialRecord {
    pub(super) token: String,
    pub(super) user: AccountUser,
}

#[derive(Debug)]
pub(super) enum CredentialFailure {
    Unavailable,
}

pub(super) trait CredentialBackend: Send + Sync {
    fn read(&self) -> Result<Option<String>, CredentialFailure>;
    fn write(&self, value: &str) -> Result<(), CredentialFailure>;
    fn clear(&self) -> Result<(), CredentialFailure>;
}

#[derive(Clone)]
pub(super) struct SystemCredentialStore {
    service: String,
    credential: String,
}

impl SystemCredentialStore {
    fn new(service: impl Into<String>, credential: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            credential: credential.into(),
        }
    }

    pub(super) fn for_profile(install_id: &str) -> Self {
        let digest = Sha256::digest(install_id.as_bytes());
        let suffix = digest
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        Self::new(
            APP_CREDENTIAL_SERVICE,
            format!("{ACCOUNT_CREDENTIAL_NAME}:{suffix}"),
        )
    }

    fn entry(&self) -> Result<Entry, CredentialFailure> {
        Entry::new(&self.service, &self.credential).map_err(|_| CredentialFailure::Unavailable)
    }
}

impl CredentialBackend for SystemCredentialStore {
    fn read(&self) -> Result<Option<String>, CredentialFailure> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(CredentialFailure::Unavailable),
        }
    }

    fn write(&self, value: &str) -> Result<(), CredentialFailure> {
        self.entry()?
            .set_password(value)
            .map_err(|_| CredentialFailure::Unavailable)
    }

    fn clear(&self) -> Result<(), CredentialFailure> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(CredentialFailure::Unavailable),
        }
    }
}

#[cfg(test)]
mod profile_credential_tests {
    use super::SystemCredentialStore;

    #[test]
    fn credential_entries_are_stable_and_scoped_by_install_id() {
        let first = SystemCredentialStore::for_profile("profile-one");
        let first_again = SystemCredentialStore::for_profile("profile-one");
        let second = SystemCredentialStore::for_profile("profile-two");

        assert_eq!(first.service, first_again.service);
        assert_eq!(first.credential, first_again.credential);
        assert_ne!(first.credential, second.credential);
    }
}

#[cfg(all(test, any(target_os = "windows", target_os = "macos")))]
mod system_credential_tests {
    use std::process::Command;

    use uuid::Uuid;

    use super::{CredentialBackend, SystemCredentialStore};

    const MODE: &str = "NATUX_SYSTEM_CREDENTIAL_FIXTURE_MODE";
    const SERVICE: &str = "NATUX_SYSTEM_CREDENTIAL_FIXTURE_SERVICE";
    const NAME: &str = "NATUX_SYSTEM_CREDENTIAL_FIXTURE_NAME";
    const VALUE: &str = "temporary-credential-fixture";
    const CHILD: &str =
        "account::transport::system_credential_tests::credential_provider_fixture_child";

    fn fixture_store(service: &str, name: &str) -> Option<SystemCredentialStore> {
        let suffix = service.strip_prefix("world.natux.launcher.test.")?;
        let namespace = Uuid::parse_str(suffix).ok()?;
        if namespace.get_version_num() != 4
            || namespace.to_string() != suffix
            || name != format!("credential-interoperability:{namespace}")
        {
            return None;
        }
        Some(SystemCredentialStore::new(service, name))
    }

    #[cfg(target_os = "macos")]
    fn assert_disposable_macos_keychain() {
        use std::path::Path;
        for (key, expected) in [
            ("CI", "true"),
            ("GITHUB_ACTIONS", "true"),
            ("RUNNER_ENVIRONMENT", "github-hosted"),
            ("RUNNER_OS", "macOS"),
            ("GITHUB_REPOSITORY", "Alex-dev-sys/NatuxWorld"),
            ("GITHUB_JOB", "macos_acceptance"),
            ("NATUX_MACOS_CREDENTIAL_ACCEPTANCE", "1"),
        ] {
            assert_eq!(
                std::env::var(key).as_deref(),
                Ok(expected),
                "disposable macOS CI required"
            );
        }
        assert_eq!(
            std::env::var("NATUX_MACOS_CREDENTIAL_EXPECTED_ARCH").as_deref(),
            Ok(std::env::consts::ARCH),
            "native credential architecture required"
        );
        let identity = Command::new("/usr/bin/id")
            .arg("-un")
            .output()
            .expect("runner identity");
        assert!(
            identity.status.success() && identity.stdout == b"runner\n",
            "disposable runner account required"
        );
        let runner_temp =
            std::fs::canonicalize(std::env::var_os("RUNNER_TEMP").expect("runner temp")).unwrap();
        let keychain = std::fs::canonicalize(
            std::env::var_os("NATUX_MACOS_CREDENTIAL_KEYCHAIN").expect("owned keychain"),
        )
        .unwrap();
        assert_eq!(
            keychain.file_name(),
            Some(std::ffi::OsStr::new("fixture.keychain-db"))
        );
        let owner = keychain.parent().expect("keychain owner");
        assert_eq!(owner.parent(), Some(runner_temp.as_path()));
        assert!(owner
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("natux-macos-credentials-"));
        for operation in ["default-keychain", "list-keychains"] {
            let metadata = Command::new("/usr/bin/security")
                .args([operation, "-d", "user"])
                .output()
                .expect("keychain metadata");
            assert!(metadata.status.success(), "keychain metadata unavailable");
            let output = String::from_utf8(metadata.stdout).expect("UTF-8 keychain metadata");
            let paths: Vec<_> = output
                .lines()
                .filter(|line| !line.trim().is_empty())
                .collect();
            assert_eq!(paths.len(), 1, "only the fixture keychain may be selected");
            let path: String =
                serde_json::from_str(paths[0].trim()).expect("quoted keychain metadata");
            assert_eq!(std::fs::canonicalize(Path::new(&path)).unwrap(), keychain);
        }
    }

    #[test]
    fn credential_provider_fixture_child() {
        let Ok(mode) = std::env::var(MODE) else {
            return;
        };
        assert!(
            matches!(mode.as_str(), "write" | "read" | "clear"),
            "unknown fixture mode"
        );
        let service = std::env::var(SERVICE).expect("fixture service");
        let name = std::env::var(NAME).expect("fixture name");
        let store =
            fixture_store(&service, &name).expect("refusing a non-fixture credential identity");
        #[cfg(target_os = "macos")]
        assert_disposable_macos_keychain();
        match mode.as_str() {
            "write" => store.write(VALUE).expect("write fixture credential"),
            "read" => assert_eq!(
                store.read().expect("read fixture credential").as_deref(),
                Some(VALUE)
            ),
            "clear" => store.clear().expect("clear fixture credential"),
            _ => panic!("unknown credential fixture mode"),
        }
    }

    #[test]
    #[ignore = "opt-in native credential round-trip; macOS requires an owned disposable CI keychain"]
    fn system_credential_store_roundtrips_across_processes() {
        #[cfg(target_os = "macos")]
        assert_disposable_macos_keychain();
        let namespace = Uuid::new_v4();
        let service = format!("world.natux.launcher.test.{namespace}");
        let name = format!("credential-interoperability:{namespace}");
        let store = fixture_store(&service, &name).expect("safe parent fixture identity");
        assert_eq!(store.read().expect("read unused fixture identity"), None);
        let _cleanup = CredentialCleanup(store.clone());

        run_fixture_child("write", &service, &name);
        assert_eq!(
            store
                .read()
                .expect("read parent fixture credential")
                .as_deref(),
            Some(VALUE)
        );
        run_fixture_child("read", &service, &name);
        run_fixture_child("clear", &service, &name);
        assert_eq!(
            store.read().expect("check deleted fixture credential"),
            None
        );
    }

    fn run_fixture_child(mode: &str, service: &str, name: &str) {
        let output = Command::new(std::env::current_exe().expect("current test executable"))
            .args(["--exact", CHILD, "--nocapture", "--test-threads=1"])
            .env(MODE, mode)
            .env(SERVICE, service)
            .env(NAME, name)
            .output()
            .expect("start isolated credential test process");
        if !output.status.success() {
            // The child only receives the random fixture identity, never the
            // temporary keychain password. Keep provider failures actionable.
            for (stream, bytes) in [("stdout", &output.stdout), ("stderr", &output.stderr)] {
                let tail = &bytes[bytes.len().saturating_sub(16 * 1024)..];
                eprintln!(
                    "credential fixture {mode} {stream}: {}",
                    String::from_utf8_lossy(tail)
                );
            }
        }
        assert!(
            output.status.success(),
            "credential provider child failed during {mode} (exit {:?})",
            output.status.code()
        );
    }

    #[test]
    fn credential_fixture_refuses_application_entries_and_unknown_names() {
        let namespace = Uuid::new_v4();
        let service = format!("world.natux.launcher.test.{namespace}");
        let name = format!("credential-interoperability:{namespace}");
        assert!(fixture_store(&service, &name).is_some());
        for (service, name) in [
            ("world.natux.launcher", name.as_str()),
            (service.as_str(), "account-session"),
            ("unknown-service", name.as_str()),
            ("world.natux.launcher.test.not-a-uuid", name.as_str()),
            (
                service.as_str(),
                "credential-interoperability:00000000-0000-0000-0000-000000000000",
            ),
        ] {
            assert!(fixture_store(service, name).is_none());
        }
    }

    struct CredentialCleanup(SystemCredentialStore);

    impl Drop for CredentialCleanup {
        fn drop(&mut self) {
            let _ = self.0.clear();
        }
    }
}

#[derive(Clone, Copy)]
pub(super) enum HttpMethod {
    Get,
    Post,
}

pub(super) struct ApiRequest {
    pub(super) method: HttpMethod,
    pub(super) path: &'static str,
    pub(super) body: Option<Value>,
    pub(super) token: Option<String>,
}

impl ApiRequest {
    pub(super) fn get(path: &'static str, token: Option<String>) -> Self {
        Self {
            method: HttpMethod::Get,
            path,
            body: None,
            token,
        }
    }

    pub(super) fn post<T: Serialize>(path: &'static str, body: T) -> Self {
        let body = serde_json::to_value(body).unwrap_or(Value::Null);
        Self {
            method: HttpMethod::Post,
            path,
            body: Some(body),
            token: None,
        }
    }

    pub(super) fn authenticated_post<T: Serialize>(
        path: &'static str,
        body: Option<T>,
        token: &str,
    ) -> Self {
        Self {
            method: HttpMethod::Post,
            path,
            body: body.map(|body| serde_json::to_value(body).unwrap_or(Value::Null)),
            token: Some(token.to_owned()),
        }
    }
}

pub(super) struct ApiResponse {
    pub(super) status: u16,
    pub(super) body: Vec<u8>,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum TransportFailure {
    Timeout,
    Network,
    BodyTooLarge,
}

pub(super) trait ApiTransport: Send + Sync {
    fn send<'a>(
        &'a self,
        request: ApiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ApiResponse, TransportFailure>> + Send + 'a>>;
}

pub(super) struct ReqwestTransport {
    client: Client,
    origin: String,
}

impl ReqwestTransport {
    pub(super) fn new(origin: String) -> Result<Self, reqwest::Error> {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()?;
        Ok(Self { client, origin })
    }
}

impl ApiTransport for ReqwestTransport {
    fn send<'a>(
        &'a self,
        request: ApiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ApiResponse, TransportFailure>> + Send + 'a>> {
        Box::pin(async move {
            let method = match request.method {
                HttpMethod::Get => Method::GET,
                HttpMethod::Post => Method::POST,
            };
            let url = format!("{}{}", self.origin, request.path);
            let mut builder = self
                .client
                .request(method, url)
                .header(USER_AGENT, "NatuxWorldLauncher")
                .header(CONTENT_TYPE, "application/json");
            if let Some(token) = request.token.as_deref() {
                let value = format!("Bearer {token}")
                    .parse::<reqwest::header::HeaderValue>()
                    .map_err(|_| TransportFailure::Network)?;
                builder = builder.header(AUTHORIZATION, value);
            }
            if let Some(body) = request.body {
                let bytes = serde_json::to_vec(&body).map_err(|_| TransportFailure::Network)?;
                if bytes.len() > MAX_BODY_BYTES {
                    return Err(TransportFailure::BodyTooLarge);
                }
                builder = builder.body(bytes);
            }
            let mut response = builder.send().await.map_err(map_reqwest_error)?;
            let status = response.status().as_u16();
            let mut body = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(map_reqwest_error)? {
                if body.len().saturating_add(chunk.len()) > MAX_BODY_BYTES {
                    return Err(TransportFailure::BodyTooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            Ok(ApiResponse { status, body })
        })
    }
}

fn map_reqwest_error(error: reqwest::Error) -> TransportFailure {
    if error.is_timeout() {
        TransportFailure::Timeout
    } else {
        TransportFailure::Network
    }
}
