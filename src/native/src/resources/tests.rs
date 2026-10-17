use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::metadata::AssetObject;

use super::*;

const VERSION_FULL: &str =
    include_str!("../../../../electron/services/__tests__/fixtures/version-full.json");

fn platform(os: OsName, arch: &str) -> Platform {
    Platform {
        os,
        arch: arch.to_owned(),
    }
}

#[test]
fn plans_fixture_client_libraries_and_asset_index_as_relative_jobs() {
    let version = crate::metadata::parse_version_metadata(VERSION_FULL).expect("version fixture");
    let windows = platform(OsName::Windows, "x86_64");

    let client = build_client_job(&version).expect("client job");
    assert_eq!(client.destination, Path::new("versions/1.21.6/1.21.6.jar"));
    assert_eq!(client.expected_sha256, None);
    assert_eq!(client.expected_size, Some(29_516_555));

    let index = build_asset_index_job(&version).expect("asset index job");
    assert_eq!(index.destination, Path::new("assets/indexes/26.json"));
    assert_eq!(
        index.expected_sha1.as_deref(),
        Some("d086b7925d1977a4ce8a6622f44949c9ec4a4cbf")
    );

    let jobs = build_library_jobs(&version, &windows).expect("library jobs");
    assert!(jobs.len() > 60);
    assert!(jobs.iter().all(|job| {
        job.destination.starts_with("libraries")
            && !job.destination.is_absolute()
            && job.expected_sha1.is_some()
            && job.expected_size.is_some()
            && job.expected_sha256.is_none()
            && job.url.starts_with("https://")
    }));
    assert!(jobs.iter().any(|job| {
        job.destination
            .to_string_lossy()
            .ends_with("lwjgl-3.3.3-natives-windows.jar")
    }));
    assert!(!jobs.iter().any(|job| {
        let path = job.destination.to_string_lossy();
        path.ends_with("-natives-windows-arm64.jar") || path.ends_with("-natives-windows-x86.jar")
    }));

    let mac_arm =
        build_library_jobs(&version, &platform(OsName::Osx, "aarch64")).expect("macOS ARM jobs");
    assert!(mac_arm.iter().any(|job| {
        job.destination
            .to_string_lossy()
            .ends_with("lwjgl-freetype-3.3.3-natives-macos-arm64.jar")
    }));
    assert!(!mac_arm.iter().any(|job| {
        job.destination
            .to_string_lossy()
            .ends_with("lwjgl-freetype-3.3.3-natives-macos.jar")
    }));
}

#[test]
fn plans_deduplicated_content_addressed_asset_jobs() {
    let hash = "abcdef0123456789abcdef0123456789abcdef01";
    let index = AssetIndex {
        objects: BTreeMap::from([
            (
                "first".to_owned(),
                AssetObject {
                    hash: hash.to_ascii_uppercase(),
                    size: 17,
                },
            ),
            (
                "second".to_owned(),
                AssetObject {
                    hash: hash.to_owned(),
                    size: 17,
                },
            ),
        ]),
    };
    let jobs = build_asset_jobs(&index).expect("asset jobs");
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].url, format!("{ASSET_BASE_URL}/ab/{hash}"));
    assert_eq!(
        jobs[0].destination,
        Path::new("assets/objects/ab/abcdef0123456789abcdef0123456789abcdef01")
    );
    assert_eq!(jobs[0].expected_sha1.as_deref(), Some(hash));
    assert_eq!(jobs[0].expected_size, Some(17));
    assert_eq!(jobs[0].expected_sha256, None);

    let conflicting = AssetIndex {
        objects: BTreeMap::from([
            (
                "first".to_owned(),
                AssetObject {
                    hash: hash.to_owned(),
                    size: 1,
                },
            ),
            (
                "second".to_owned(),
                AssetObject {
                    hash: hash.to_owned(),
                    size: 2,
                },
            ),
        ]),
    };
    assert!(build_asset_jobs(&conflicting).is_err());
}

#[test]
fn selects_classifier_templates_and_arch_specific_named_natives() {
    let template_library: Library = serde_json::from_str(
        r#"{
          "name":"com.example:native:1.0",
          "natives":{"windows":"natives-windows-${arch}"},
          "downloads":{"classifiers":{"natives-windows-64":{"path":"com/example/native/1.0/native-64.jar","url":"https://libraries.minecraft.net/native-64.jar","sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":1}}}
        }"#,
    )
    .expect("template library");
    assert_eq!(
        native_classifier(&template_library, &platform(OsName::Windows, "amd64")),
        Some("natives-windows-64".to_owned())
    );
    assert_eq!(
        native_classifier(&template_library, &platform(OsName::Windows, "arm64")),
        None
    );

    let version = crate::metadata::parse_version_metadata(VERSION_FULL).expect("version fixture");
    let win_arm = select_native_libraries(&version.libraries, &platform(OsName::Windows, "arm64"));
    assert!(win_arm
        .iter()
        .any(|library| library.name.ends_with("natives-windows-arm64")));
    assert!(!win_arm
        .iter()
        .any(|library| library.name.ends_with("natives-windows-x86")));
}

#[test]
fn rejects_unsafe_job_paths_urls_and_hashes() {
    let path_escape = r#"{"id":"v1","libraries":[{"name":"g:a:1","downloads":{"artifact":{"path":"../../outside.jar","url":"https://libraries.minecraft.net/a.jar","sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":1}}}]}"#;
    let version = crate::metadata::parse_version_metadata(path_escape).expect("metadata shape");
    assert!(build_library_jobs(&version, &platform(OsName::Windows, "x86_64")).is_err());

    let http_url = r#"{"id":"v1","libraries":[{"name":"g:a:1","downloads":{"artifact":{"path":"g/a/1/a.jar","url":"http://libraries.minecraft.net/a.jar","sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":1}}}]}"#;
    let version = crate::metadata::parse_version_metadata(http_url).expect("metadata shape");
    assert!(build_library_jobs(&version, &platform(OsName::Windows, "x86_64")).is_err());

    let bad_hash = AssetIndex {
        objects: BTreeMap::from([(
            "bad".to_owned(),
            AssetObject {
                hash: "abc".to_owned(),
                size: 1,
            },
        )]),
    };
    assert!(build_asset_jobs(&bad_hash).is_err());
}

#[test]
fn safely_flattens_native_zip_and_skips_classes_and_metadata() {
    let temp = tempfile::tempdir().expect("temporary root");
    let archive = temp.path().join("native.jar");
    write_zip(
        &archive,
        &[
            ("nested/libok.so", b"native", None),
            ("nested/Skip.class", b"class", None),
            ("META-INF/MANIFEST.MF", b"metadata", None),
        ],
    );
    let output = temp.path().join("natives");
    fs::create_dir(&output).expect("native output directory");
    let root = fs::canonicalize(&output).expect("canonical output");

    extract_archive(&archive, &root).expect("extract native archive");
    assert_eq!(
        fs::read(output.join("libok.so")).expect("native bytes"),
        b"native"
    );
    assert!(!output.join("Skip.class").exists());
    assert!(!output.join("MANIFEST.MF").exists());
}

#[test]
fn rejects_zip_traversal_and_symlink_entries() {
    let temp = tempfile::tempdir().expect("temporary root");
    let output = temp.path().join("natives");
    fs::create_dir(&output).expect("native output directory");
    let root = fs::canonicalize(&output).expect("canonical output");

    let traversal = temp.path().join("traversal.jar");
    write_zip(&traversal, &[("../escaped.bin", b"escape", None)]);
    assert!(extract_archive(&traversal, &root).is_err());
    assert!(!temp.path().join("escaped.bin").exists());

    let symlink = temp.path().join("symlink.jar");
    write_zip(&symlink, &[("liblink.so", b"target", Some(0o120777))]);
    assert!(extract_archive(&symlink, &root).is_err());
    assert!(!output.join("liblink.so").exists());
}

#[test]
fn rejects_native_archives_that_exceed_entry_or_expanded_size_limits() {
    let temp = tempfile::tempdir().expect("temporary root");
    let archive = temp.path().join("native.jar");
    write_zip(&archive, &[("libok.so", b"native", None)]);
    let output = temp.path().join("natives");
    fs::create_dir(&output).expect("native output directory");
    let root = fs::canonicalize(&output).expect("canonical output");

    assert!(extract_archive_with_limits(&archive, &root, 0, 1024).is_err());
    assert!(extract_archive_with_limits(&archive, &root, 10, 5).is_err());
    assert!(!output.join("libok.so").exists());
}

#[test]
fn cancellation_during_chunked_native_extraction_cleans_staging_and_preserves_old_directory() {
    let temp = tempfile::tempdir().expect("temporary root");
    let archive_path = temp
        .path()
        .join("libraries/example/natives/1.0/natives.jar");
    fs::create_dir_all(archive_path.parent().expect("archive parent"))
        .expect("create archive parent");
    let native_bytes = vec![b'x'; NATIVE_COPY_BUFFER_BYTES * 3 + 7];
    write_zip(
        &archive_path,
        &[("nested/new-native.dll", native_bytes.as_slice(), None)],
    );
    let metadata = r#"{
      "id":"test-version",
      "libraries":[{
        "name":"example:natives:1.0",
        "natives":{"windows":"natives-windows"},
        "downloads":{"classifiers":{"natives-windows":{
          "path":"example/natives/1.0/natives.jar",
          "url":"https://libraries.minecraft.net/natives.jar",
          "sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "size":1
        }}}
      }]
    }"#;
    let version = crate::metadata::parse_version_metadata(metadata).expect("native metadata");
    let platform = platform(OsName::Windows, "x86_64");
    let version_dir = temp.path().join("versions/test-version");
    let native_dir = version_dir.join("natives");
    fs::create_dir_all(&native_dir).expect("existing native output");
    fs::write(native_dir.join("old-native.dll"), b"complete old native")
        .expect("write existing native");

    let cancellation = crate::cancellation::CancellationToken::default();
    let mut copied_chunks = Vec::new();
    let result = extract_natives_with_observer(
        &version,
        temp.path(),
        &native_dir,
        &platform,
        &cancellation,
        |chunk_size| {
            copied_chunks.push(chunk_size);
            cancellation.cancel();
        },
    );

    assert_eq!(result.unwrap_err(), "Отменено");
    assert_eq!(copied_chunks, [NATIVE_COPY_BUFFER_BYTES]);
    assert!(native_bytes.len() > NATIVE_COPY_BUFFER_BYTES);
    assert_eq!(
        fs::read(native_dir.join("old-native.dll")).expect("preserved old native"),
        b"complete old native"
    );
    assert!(!native_dir.join("new-native.dll").exists());
    let leftovers = fs::read_dir(&version_dir)
        .expect("list native parent")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with(".natives."))
        .collect::<Vec<_>>();
    assert!(leftovers.is_empty(), "staging or backup directory remains");
}

fn write_zip(path: &Path, entries: &[(&str, &[u8], Option<u32>)]) {
    let mut archive = zip::ZipWriter::new(File::create(path).expect("create archive"));
    for (name, contents, permissions) in entries {
        let mut options = zip::write::SimpleFileOptions::default();
        if let Some(mode) = permissions {
            options = options.unix_permissions(*mode);
        }
        archive
            .start_file(name, options)
            .expect("start archive entry");
        archive.write_all(contents).expect("write archive entry");
    }
    archive.finish().expect("finish archive");
    if let Some((_, _, Some(mode))) = entries
        .iter()
        .find(|(_, _, mode)| mode.is_some_and(|mode| mode & 0o170000 == 0o120000))
    {
        let mut bytes = fs::read(path).expect("read archive for symlink metadata");
        let central = bytes
            .windows(4)
            .position(|window| window == b"PK\x01\x02")
            .expect("central directory entry");
        let permissions_offset = central + 40;
        bytes[permissions_offset] = *mode as u8;
        bytes[permissions_offset + 1] = (*mode >> 8) as u8;
        fs::write(path, bytes).expect("write symlink metadata");
    }
}
