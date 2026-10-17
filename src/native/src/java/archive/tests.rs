use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use tar::{Builder as TarBuilder, EntryType, Header};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::cancellation::CancellationToken;

use super::*;

const TEST_LIMITS: Limits = Limits {
    entries: 16,
    expanded_bytes: 1024,
};

#[allow(dead_code)]
enum TarFixture<'a> {
    File(&'a str, &'a [u8], u32),
    Directory(&'a str),
    Symlink(&'a str, &'a str),
    Hardlink(&'a str, &'a str),
}

fn zip_fixture(entries: &[(&str, &[u8], u32)]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, contents, mode) in entries {
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(*mode);
        writer.start_file(*name, options).expect("start ZIP entry");
        writer.write_all(contents).expect("write ZIP entry");
    }
    writer.finish().expect("finish ZIP").into_inner()
}

fn tar_fixture(entries: &[TarFixture<'_>]) -> Vec<u8> {
    let encoder = GzEncoder::new(Vec::new(), Compression::default());
    let mut builder = TarBuilder::new(encoder);
    for fixture in entries {
        let (path, kind, mode, link, contents) = match fixture {
            TarFixture::File(path, contents, mode) => {
                (*path, EntryType::Regular, *mode, None, *contents)
            }
            TarFixture::Directory(path) => (*path, EntryType::Directory, 0o755, None, &[][..]),
            TarFixture::Symlink(path, target) => {
                (*path, EntryType::Symlink, 0o777, Some(*target), &[][..])
            }
            TarFixture::Hardlink(path, target) => {
                (*path, EntryType::Link, 0o644, Some(*target), &[][..])
            }
        };
        let mut header = Header::new_gnu();
        header.set_entry_type(kind);
        header.set_size(contents.len() as u64);
        header.set_mode(mode);
        if let Some(target) = link {
            header.set_link_name(target).expect("set TAR link target");
        }
        header.set_cksum();
        builder
            .append_data(&mut header, path, Cursor::new(contents))
            .expect("append TAR entry");
    }
    builder
        .into_inner()
        .expect("finish TAR stream")
        .finish()
        .expect("finish gzip")
}

fn tar_fixture_with_traversal() -> Vec<u8> {
    let compressed = tar_fixture(&[TarFixture::File("safe.txt", b"no", 0o644)]);
    let mut raw = Vec::new();
    GzDecoder::new(Cursor::new(compressed))
        .read_to_end(&mut raw)
        .expect("decompress TAR fixture");
    raw[..100].fill(0);
    raw[.."../escaped.txt".len()].copy_from_slice(b"../escaped.txt");
    raw[148..156].fill(b' ');
    let checksum: u64 = raw[..512].iter().map(|byte| u64::from(*byte)).sum();
    let checksum_field = format!("{checksum:06o}\0 ");
    raw[148..156].copy_from_slice(checksum_field.as_bytes());
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&raw).expect("compress traversal TAR");
    encoder.finish().expect("finish traversal gzip")
}

fn write_archive(path: &Path, contents: &[u8]) -> PathBuf {
    fs::write(path, contents).expect("write archive fixture");
    path.to_path_buf()
}

#[test]
fn extracts_normal_zip_and_preserves_unix_executable_bits() {
    let temp = tempfile::tempdir().expect("temp directory");
    let archive = write_archive(
        &temp.path().join("runtime.zip"),
        &zip_fixture(&[("jre-21/bin/javaw.exe", b"fixture", 0o755)]),
    );
    let output = temp.path().join("output");
    fs::create_dir(&output).expect("output directory");

    extract_zip(&archive, &output, TEST_LIMITS).expect("extract safe ZIP");
    let executable = output.join("jre-21/bin/javaw.exe");
    assert_eq!(fs::read(&executable).expect("read ZIP file"), b"fixture");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_ne!(
            fs::metadata(executable).unwrap().permissions().mode() & 0o111,
            0
        );
    }
}

#[test]
fn rejects_zip_traversal_and_expanded_size_overflow() {
    let temp = tempfile::tempdir().expect("temp directory");
    let output = temp.path().join("output");
    fs::create_dir(&output).expect("output directory");
    let traversal = write_archive(
        &temp.path().join("traversal.zip"),
        &zip_fixture(&[("../escaped.txt", b"no", 0o644)]),
    );
    assert!(extract_zip(&traversal, &output, TEST_LIMITS).is_err());
    assert!(!temp.path().join("escaped.txt").exists());

    let oversized = write_archive(
        &temp.path().join("oversized.zip"),
        &zip_fixture(&[("jre-21/bin/file", b"12345", 0o644)]),
    );
    let limits = Limits {
        entries: 2,
        expanded_bytes: 4,
    };
    assert!(extract_zip(&oversized, &output, limits).is_err());
}

#[test]
fn extracts_normal_tar_gz_and_rejects_traversal_and_caps() {
    let temp = tempfile::tempdir().expect("temp directory");
    let output = temp.path().join("output");
    fs::create_dir(&output).expect("output directory");
    let normal = write_archive(
        &temp.path().join("normal.tar.gz"),
        &tar_fixture(&[TarFixture::File("jre-21/bin/java", b"fixture", 0o755)]),
    );
    extract_tar_gz(&normal, &output, TEST_LIMITS).expect("extract safe TAR");
    assert_eq!(
        fs::read(output.join("jre-21/bin/java")).expect("read TAR file"),
        b"fixture"
    );

    let traversal = write_archive(
        &temp.path().join("traversal.tar.gz"),
        &tar_fixture_with_traversal(),
    );
    let other_output = temp.path().join("other-output");
    fs::create_dir(&other_output).expect("other output directory");
    assert!(extract_tar_gz(&traversal, &other_output, TEST_LIMITS).is_err());
    assert!(!temp.path().join("escaped.txt").exists());

    let oversized = write_archive(
        &temp.path().join("oversized.tar.gz"),
        &tar_fixture(&[TarFixture::File("jre-21/bin/java", b"12345", 0o755)]),
    );
    assert!(extract_tar_gz(
        &oversized,
        &other_output,
        Limits {
            entries: 2,
            expanded_bytes: 4,
        }
    )
    .is_err());
}

#[cfg(unix)]
#[test]
fn allows_internal_tar_links_and_rejects_escaping_symlinks() {
    let temp = tempfile::tempdir().expect("temp directory");
    let output = temp.path().join("output");
    fs::create_dir(&output).expect("output directory");
    let internal = write_archive(
        &temp.path().join("internal.tar.gz"),
        &tar_fixture(&[
            TarFixture::Directory("jre-21"),
            TarFixture::File("jre-21/bin/java", b"fixture", 0o755),
            TarFixture::Symlink("jre-21/bin/java-link", "java"),
            TarFixture::Hardlink("jre-21/bin/java-hardlink", "jre-21/bin/java"),
        ]),
    );
    extract_tar_gz(&internal, &output, TEST_LIMITS).expect("extract internal links");
    assert_eq!(
        fs::read(output.join("jre-21/bin/java-link")).expect("follow symlink"),
        b"fixture"
    );
    assert_eq!(
        fs::read(output.join("jre-21/bin/java-hardlink")).expect("read hard link"),
        b"fixture"
    );

    let escaping = write_archive(
        &temp.path().join("escaping.tar.gz"),
        &tar_fixture(&[TarFixture::Symlink(
            "jre-21/bin/escape",
            "../../../../outside",
        )]),
    );
    let clean_output = temp.path().join("clean-output");
    fs::create_dir(&clean_output).expect("clean output directory");
    assert!(extract_tar_gz(&escaping, &clean_output, TEST_LIMITS).is_err());
}

#[test]
fn install_archive_replaces_runtime_atomically_and_keeps_old_runtime_on_validation_error() {
    let temp = tempfile::tempdir().expect("temp directory");
    let runtime = temp.path().join("runtime");
    let target = runtime.join("jre-21");
    fs::create_dir_all(&target).expect("old runtime");
    fs::write(target.join("old.marker"), b"old").expect("old marker");
    let archive = write_archive(
        &temp.path().join("runtime.tar.gz"),
        &tar_fixture(&[TarFixture::File("package/bin/java", b"new", 0o755)]),
    );

    install_archive(&archive, &runtime, ArchiveKind::TarGz, "bin/java", |_| {
        Ok(())
    })
    .expect("install valid runtime");
    assert_eq!(fs::read(target.join("bin/java")).unwrap(), b"new");
    assert!(!target.join("old.marker").exists());

    fs::write(target.join("old.marker"), b"old-again").expect("restore marker");
    let failed = install_archive(&archive, &runtime, ArchiveKind::TarGz, "bin/java", |_| {
        Err("probe rejected runtime".to_owned())
    });
    assert!(failed.is_err());
    assert_eq!(fs::read(target.join("old.marker")).unwrap(), b"old-again");
    assert!(fs::read_dir(&runtime).unwrap().all(|entry| !entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".jre-21-stage-")));
}

#[test]
fn cancellation_before_archive_commit_cleans_staging_and_preserves_old_runtime() {
    let temp = tempfile::tempdir().expect("temp directory");
    let contents = vec![b'x'; 256 * 1024];

    for (kind, filename, bytes) in [
        (
            ArchiveKind::Zip,
            "runtime.zip",
            zip_fixture(&[("package/bin/java", &contents, 0o755)]),
        ),
        (
            ArchiveKind::TarGz,
            "runtime.tar.gz",
            tar_fixture(&[TarFixture::File("package/bin/java", &contents, 0o755)]),
        ),
    ] {
        let runtime = temp.path().join(format!("runtime-{filename}"));
        let target = runtime.join("jre-21");
        fs::create_dir_all(&target).expect("old runtime");
        fs::write(target.join("old.marker"), b"old").expect("old marker");
        let archive = write_archive(&temp.path().join(filename), &bytes);
        let cancellation = CancellationToken::default();
        let cancel_before_commit = cancellation.clone();
        let result = install_archive_cancelable(
            &archive,
            &runtime,
            kind,
            "bin/java",
            &cancellation,
            move |_| {
                cancel_before_commit.cancel();
                Ok(())
            },
        );
        assert_eq!(result, Err("Отменено".to_owned()));
        assert_eq!(fs::read(target.join("old.marker")).unwrap(), b"old");
        assert!(fs::read_dir(&runtime).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".jre-21-stage-")));
    }
}
