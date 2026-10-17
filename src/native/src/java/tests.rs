use super::status_failure;
use super::{metadata_url, parse_metadata, ArchiveKind, JavaArch, JavaOs, JavaTarget};
use crate::cancellation::CancellationToken;
use crate::launcher::retry::RetryFailure;

fn make_target(os: JavaOs, arch: JavaArch) -> JavaTarget {
    JavaTarget::new(os, arch)
}

fn metadata(target: JavaTarget, package_name: &str, release_tag: &str, checksum: &str) -> String {
    format!(
        r#"[{{
            "vendor":"eclipse",
            "version_data":{{"major":21,"semver":"21.0.8+9"}},
            "binaries":[{{
                "architecture":"{}",
                "image_type":"jre",
                "jvm_impl":"hotspot",
                "os":"{}",
            "project":"jdk",
                "package":{{
                    "name":"{}",
                    "link":"https://github.com/adoptium/temurin21-binaries/releases/download/{}/{}",
                    "checksum":"{}",
                    "size":123456
                }}
            }}]
        }}]"#,
        target.arch.adoptium_name(),
        target.os.adoptium_name(),
        package_name,
        release_tag,
        package_name,
        checksum,
    )
}

fn package_name(target: JavaTarget) -> String {
    let extension = if target.os == JavaOs::Windows {
        "zip"
    } else {
        "tar.gz"
    };
    format!(
        "OpenJDK21U-jre_{}_{}_hotspot_21.0.8_9.{extension}",
        target.arch.adoptium_name(),
        target.os.adoptium_name()
    )
}

#[test]
fn metadata_urls_are_platform_specific() {
    assert_eq!(
        metadata_url(make_target(JavaOs::Windows, JavaArch::X64)),
        "https://api.adoptium.net/v3/assets/feature_releases/21/ga?architecture=x64&image_type=jre&jvm_impl=hotspot&os=windows&page_size=1&project=jdk&vendor=eclipse"
    );
    assert!(metadata_url(make_target(JavaOs::Mac, JavaArch::Aarch64)).contains("os=mac"));
    assert!(metadata_url(make_target(JavaOs::Linux, JavaArch::X64)).contains("os=linux"));
}

#[tokio::test]
async fn java_detection_cancellation_is_propagated_from_the_blocking_worker() {
    let cancellation = CancellationToken::default();
    cancellation.cancel();

    let result = super::detect_cancelable_blocking(
        std::path::PathBuf::from("unused-runtime-directory"),
        make_target(JavaOs::Windows, JavaArch::X64),
        cancellation,
    )
    .await;

    assert_eq!(result, Err("Отменено".to_owned()));
}

#[test]
fn accepts_matching_temurin_21_release_and_preserves_verified_download_fields() {
    let target = make_target(JavaOs::Linux, JavaArch::Aarch64);
    let package = package_name(target);
    let checksum = "a".repeat(64);
    let raw = metadata(target, &package, "jdk-21.0.8%2B9", &checksum);

    let release = parse_metadata(&raw, target).expect("valid Temurin metadata");
    assert_eq!(release.archive, ArchiveKind::TarGz);
    assert_eq!(release.version, "21.0.8+9");
    assert_eq!(release.sha256, checksum);

    let job = release.download_job();
    assert_eq!(
        job.destination,
        std::path::PathBuf::from("runtime").join(package)
    );
    assert_eq!(job.expected_sha256.as_deref(), Some(checksum.as_str()));
    assert_eq!(job.expected_size, Some(123456));
}

#[test]
fn rejects_mismatched_or_unsafe_release_metadata() {
    let target = make_target(JavaOs::Windows, JavaArch::X64);
    let package = package_name(target);
    let checksum = "b".repeat(64);

    let wrong_arch = metadata(
        make_target(JavaOs::Windows, JavaArch::Aarch64),
        &package,
        "jdk-21.0.8+9",
        &checksum,
    );
    assert!(parse_metadata(&wrong_arch, target).is_err());

    let wrong_project = metadata(target, &package, "jdk-21.0.8+9", &checksum)
        .replace("\"project\":\"jdk\"", "\"project\":\"jre\"");
    assert!(parse_metadata(&wrong_project, target).is_err());

    let unsafe_name = metadata(target, "../java.zip", "jdk-21.0.8+9", &checksum);
    assert!(parse_metadata(&unsafe_name, target).is_err());

    let wrong_checksum = metadata(target, &package, "jdk-21.0.8+9", "not-a-sha256");
    assert!(parse_metadata(&wrong_checksum, target).is_err());
}

#[test]
fn adoptium_retries_transient_http_statuses_but_not_client_errors() {
    assert!(matches!(status_failure(429), RetryFailure::Transient(_)));
    assert!(matches!(status_failure(503), RetryFailure::Transient(_)));
    assert!(matches!(status_failure(404), RetryFailure::Permanent(_)));
}
