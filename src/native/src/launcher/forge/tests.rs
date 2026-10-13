use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use super::{cached_forge_version, classify_cached_jar_error, remove_stale_forge_cache};

const MINECRAFT_VERSION: &str = "1.21.1";
const FORGE_ID: &str = "1.21.1-forge-52.1.14";

fn cached_paths(root: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
    let version_json = root
        .join("versions")
        .join(FORGE_ID)
        .join(format!("{FORGE_ID}.json"));
    let client_jar = root
        .join("libraries/net/minecraftforge/forge/1.21.1-52.1.14")
        .join("forge-1.21.1-52.1.14-client.jar");
    (version_json, client_jar)
}

fn write_valid_json(path: &Path) {
    fs::create_dir_all(path.parent().expect("version metadata parent"))
        .expect("create version metadata directory");
    fs::write(
        path,
        format!(r#"{{"id":"{FORGE_ID}","inheritsFrom":"{MINECRAFT_VERSION}"}}"#),
    )
    .expect("write Forge version metadata");
}

fn write_valid_client_jar(path: &Path) {
    fs::create_dir_all(path.parent().expect("client JAR parent"))
        .expect("create client JAR directory");
    let mut archive = zip::ZipWriter::new(File::create(path).expect("create client JAR"));
    archive
        .start_file(
            "net/minecraft/client/Minecraft.class",
            zip::write::SimpleFileOptions::default(),
        )
        .expect("start Minecraft client class entry");
    archive
        .write_all(b"valid test class")
        .expect("write Minecraft client class entry");
    archive.finish().expect("finish client JAR");
}

#[test]
fn malformed_cached_json_is_disposable_and_does_not_block_reinstall() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let (version_json, client_jar) = cached_paths(root.path());
    fs::create_dir_all(version_json.parent().expect("metadata parent"))
        .expect("create metadata directory");
    fs::write(&version_json, br#"{"id":"truncated""#).expect("write malformed JSON");
    write_valid_client_jar(&client_jar);

    assert!(
        cached_forge_version(&version_json, &client_jar, MINECRAFT_VERSION, FORGE_ID)
            .expect("invalid cache is recoverable")
            .is_none()
    );
    remove_stale_forge_cache(&version_json, &client_jar).expect("remove invalid Forge cache");

    assert!(!version_json.exists());
    assert!(!client_jar.exists());
}

#[test]
fn corrupt_cached_jar_is_disposable_and_does_not_block_reinstall() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let (version_json, client_jar) = cached_paths(root.path());
    write_valid_json(&version_json);
    fs::create_dir_all(client_jar.parent().expect("client JAR parent"))
        .expect("create client JAR directory");
    fs::write(&client_jar, b"not a ZIP archive").expect("write corrupt client JAR");

    assert!(
        cached_forge_version(&version_json, &client_jar, MINECRAFT_VERSION, FORGE_ID)
            .expect("invalid cache is recoverable")
            .is_none()
    );
    remove_stale_forge_cache(&version_json, &client_jar).expect("remove invalid Forge cache");

    assert!(!version_json.exists());
    assert!(!client_jar.exists());
}

#[test]
fn missing_cached_jar_invalidates_and_cleans_the_partial_forge_cache() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let (version_json, client_jar) = cached_paths(root.path());
    write_valid_json(&version_json);

    assert!(
        cached_forge_version(&version_json, &client_jar, MINECRAFT_VERSION, FORGE_ID)
            .expect("missing JAR is recoverable")
            .is_none()
    );
    remove_stale_forge_cache(&version_json, &client_jar).expect("remove incomplete Forge cache");

    assert!(!version_json.exists());
    assert!(!client_jar.exists());
}

#[test]
fn cached_jar_permission_errors_are_not_treated_as_corrupt_cache() {
    let error =
        zip::result::ZipError::Io(std::io::Error::from(std::io::ErrorKind::PermissionDenied));

    assert!(classify_cached_jar_error(error).is_err());
}
