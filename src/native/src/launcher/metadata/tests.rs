use super::*;

const VERSION_FULL: &str =
    include_str!("../../../../../electron/services/__tests__/fixtures/version-full.json");

#[tokio::test]
async fn resolve_version_uses_a_valid_cached_version_without_network_access() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let path = version_cache_path(root.path(), "1.21.6").expect("safe cache path");
    fs::create_dir_all(path.parent().expect("cache parent")).expect("create cache directory");
    fs::write(&path, VERSION_FULL).expect("seed version cache");

    let version = resolve_version(root.path(), "1.21.6", &CancellationToken::default())
        .await
        .expect("load cache without accessing Mojang");

    assert_eq!(version.id, "1.21.6");
    assert_eq!(
        fs::read_to_string(path).expect("cached bytes"),
        VERSION_FULL
    );
}

#[tokio::test]
#[ignore = "manual E4 acceptance: downloads and verifies the complete Minecraft 1.21.6 resource set"]
async fn live_minecraft_resources_install_complete_for_current_platform() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let result = tokio::time::timeout(Duration::from_secs(900), async {
        crate::launcher::disk::ensure_sufficient_space(root.path())?;
        let cancellation = CancellationToken::default();
        let version = resolve_version(root.path(), "1.21.6", &cancellation).await?;
        let platform = crate::metadata::Platform::current();
        let downloads = crate::downloads::DownloadService::new(root.path())
            .map_err(|error| error.to_string())?;

        let mut game_jobs = crate::resources::build_library_jobs(&version, &platform)?;
        game_jobs.push(crate::resources::build_client_job(&version)?);
        downloads
            .download_many_cancelable(game_jobs, cancellation.clone(), |_, _, _| {})
            .await
            .map_err(|error| error.to_string())?;

        let index_job = crate::resources::build_asset_index_job(&version)?;
        let index_path = root.path().join(&index_job.destination);
        downloads
            .download_many_cancelable(vec![index_job], cancellation.clone(), |_, _, _| {})
            .await
            .map_err(|error| error.to_string())?;
        let index_bytes = fs::read(&index_path).map_err(|error| error.to_string())?;
        let index = parse_asset_index_file(&index_bytes)?;
        let asset_jobs = crate::resources::build_asset_jobs(&index)?;
        assert!(
            asset_jobs.len() > 4_000,
            "real asset index should contain thousands of objects"
        );
        let asset_bytes = asset_jobs
            .iter()
            .try_fold(0_u64, |total, job| total.checked_add(job.expected_size?))
            .ok_or_else(|| "asset total size overflow".to_owned())?;
        if asset_bytes > crate::launcher::MAX_TOTAL_ASSET_BYTES {
            return Err("asset total exceeds the launcher's configured limit".to_owned());
        }
        downloads
            .download_many_cancelable(asset_jobs.clone(), cancellation, |_, _, _| {})
            .await
            .map_err(|error| error.to_string())?;

        let client = crate::resources::build_client_job(&version)?;
        let client_path = root.path().join(client.destination);
        let client_size = fs::metadata(client_path)
            .map_err(|error| error.to_string())?
            .len();
        if Some(client_size) != client.expected_size {
            return Err("downloaded client JAR does not match Mojang's advertised size".to_owned());
        }

        let natives = root
            .path()
            .join("versions")
            .join(&version.id)
            .join("natives");
        crate::resources::extract_natives(&version, root.path(), &natives, &platform)?;
        let extracted_native = fs::read_dir(natives)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .any(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()));
        if !extracted_native {
            return Err("no native libraries were extracted for the current platform".to_owned());
        }

        Ok::<(), String>(())
    })
    .await
    .expect("live Minecraft resource installation exceeded the 15-minute acceptance limit");

    result.expect(
        "download and verify real Minecraft metadata, client, libraries, assets, and natives",
    );
}

#[test]
fn malformed_oversized_and_mismatched_cache_entries_are_removed() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let path = version_cache_path(root.path(), "1.21.6").expect("safe cache path");
    fs::create_dir_all(path.parent().expect("cache parent")).expect("create cache directory");

    fs::write(&path, b"{").expect("write malformed metadata");
    assert!(load_cached_version(root.path(), "1.21.6")
        .expect("ignore malformed cache")
        .is_none());
    assert!(!path.exists());

    let mut other_version: serde_json::Value =
        serde_json::from_str(VERSION_FULL).expect("parse version fixture");
    other_version["id"] = serde_json::Value::String("1.21.5".to_owned());
    fs::write(
        &path,
        serde_json::to_vec(&other_version).expect("serialize mismatched metadata"),
    )
    .expect("write mismatched metadata");
    assert!(load_cached_version(root.path(), "1.21.6")
        .expect("ignore mismatched cache")
        .is_none());
    assert!(!path.exists());

    fs::write(&path, vec![b' '; MAX_METADATA_BYTES + 1]).expect("write oversized metadata");
    assert!(load_cached_version(root.path(), "1.21.6")
        .expect("ignore oversized cache")
        .is_none());
    assert!(!path.exists());
}

#[test]
fn version_cache_writes_atomic_mojang_bytes_and_rejects_unsafe_ids() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");

    write_version_cache(root.path(), "1.21.6", VERSION_FULL.as_bytes())
        .expect("write valid metadata");
    let cached = load_cached_version(root.path(), "1.21.6")
        .expect("read valid metadata")
        .expect("cache hit");

    assert_eq!(cached.id, "1.21.6");
    assert_eq!(
        fs::read(version_cache_path(root.path(), "1.21.6").unwrap()).unwrap(),
        VERSION_FULL.as_bytes()
    );
    assert!(version_cache_path(root.path(), "../outside").is_err());
    assert!(write_version_cache(root.path(), "../outside", VERSION_FULL.as_bytes()).is_err());
}

#[test]
fn official_space_containing_version_id_is_safe_for_cache_and_resource_paths() {
    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let id = "3D Shareware v1.34";
    let cache_path = version_cache_path(root.path(), id).expect("official version id path");
    assert!(cache_path.ends_with(format!("versions/{id}/{id}.json")));

    let mut version: VersionMetadata =
        serde_json::from_str(VERSION_FULL).expect("parse version fixture");
    version.id = id.to_owned();
    let client = crate::resources::build_client_job(&version)
        .expect("official version id should produce a safe client path");
    assert_eq!(
        client.destination.to_string_lossy(),
        format!("versions/{id}/{id}.jar")
    );
}

#[cfg(unix)]
#[test]
fn version_cache_rejects_symlinked_directory_escape() {
    use std::os::unix::fs::symlink;

    let root = tempfile::tempdir().expect("temporary Minecraft root");
    let outside = tempfile::tempdir().expect("outside directory");
    symlink(outside.path(), root.path().join("versions")).expect("link versions outside root");

    assert!(write_version_cache(root.path(), "1.21.6", VERSION_FULL.as_bytes()).is_err());
    assert!(load_cached_version(root.path(), "1.21.6").is_err());
    assert!(!outside.path().join("1.21.6").exists());

    let file_root = tempfile::tempdir().expect("temporary Minecraft root for file link");
    let outside_file = outside.path().join("version.json");
    fs::write(&outside_file, VERSION_FULL).expect("write external metadata");
    let file_path = version_cache_path(file_root.path(), "1.21.6").expect("safe cache path");
    fs::create_dir_all(file_path.parent().expect("cache parent")).expect("create cache directory");
    symlink(&outside_file, &file_path).expect("link cache file outside root");

    assert!(load_cached_version(file_root.path(), "1.21.6").is_err());
    assert!(write_version_cache(file_root.path(), "1.21.6", b"replace").is_err());
    assert_eq!(
        fs::read(&outside_file).expect("external bytes"),
        VERSION_FULL.as_bytes()
    );
}
