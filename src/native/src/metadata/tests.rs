use std::collections::BTreeMap;

use super::*;

const VERSION_META: &str =
    include_str!("../../../../electron/services/__tests__/fixtures/version-meta.json");
const VERSION_FULL: &str =
    include_str!("../../../../electron/services/__tests__/fixtures/version-full.json");
const FORGE_VERSION: &str =
    include_str!("../../../../electron/services/__tests__/fixtures/forge-version-1.21.6.json");

fn platform(os: OsName, arch: &str) -> Platform {
    Platform {
        os,
        arch: arch.to_owned(),
    }
}

#[test]
fn parses_checked_in_mojang_manifest_and_full_version_fixtures() {
    let manifest_json = format!(r#"{{"versions":[{VERSION_META}]}}"#);
    let manifest = parse_version_manifest(&manifest_json).expect("parse manifest fixture");
    let entry = find_version(&manifest, "1.21.6").expect("find 1.21.6");
    assert_eq!(entry.version_type, "release");
    assert!(entry.url.starts_with("https://"));

    let version = parse_version_metadata(VERSION_FULL).expect("parse full version fixture");
    assert_eq!(version.id, "1.21.6");
    assert_eq!(
        version.main_class.as_deref(),
        Some("net.minecraft.client.main.Main")
    );
    assert_eq!(version.asset_index.as_ref().unwrap().id, "26");
    assert!(version.libraries.len() > 60);
    assert_eq!(version.java_version.as_ref().unwrap().major_version, 21);
}

#[test]
fn rejects_unsafe_manifest_ids_and_malformed_sha1() {
    let unsafe_id = r#"{"versions":[{"id":"../outside","url":"https://example.com/v.json","sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","type":"release"}]}"#;
    assert!(parse_version_manifest(unsafe_id).is_err());
    let bad_hash = r#"{"versions":[{"id":"1.0","url":"https://example.com/v.json","sha1":"xyz","type":"release"}]}"#;
    assert!(parse_version_manifest(bad_hash).is_err());
    let http_url = r#"{"versions":[{"id":"1.0","url":"http://example.com/v.json","sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","type":"release"}]}"#;
    assert!(parse_version_manifest(http_url).is_err());
}

#[test]
fn accepts_official_mojang_ids_with_internal_spaces_but_rejects_windows_unsafe_names() {
    for id in ["1.14.2 Pre-Release 4", "3D Shareware v1.34"] {
        let manifest = serde_json::json!({
            "versions": [{
                "id": id,
                "url": "https://example.com/version.json",
                "sha1": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "type": "old_beta"
            }]
        });
        let parsed = parse_version_manifest(&manifest.to_string())
            .unwrap_or_else(|error| panic!("official Mojang id {id:?} should parse: {error}"));
        assert_eq!(parsed.versions[0].id, id);
    }

    for id in [
        "../outside",
        " trailing",
        "trailing ",
        "CON",
        "con.txt",
        "COM1.v2",
    ] {
        assert!(
            validate_version_id(id).is_err(),
            "unsafe version id {id:?} should be rejected"
        );
    }
}

#[test]
fn inheritance_merges_forge_over_vanilla_and_keeps_base_assets() {
    let vanilla = parse_version_metadata(VERSION_FULL).expect("parse vanilla fixture");
    let forge = parse_version_metadata(FORGE_VERSION).expect("parse Forge fixture");
    let merged = merge_inherited(&vanilla, forge).expect("merge Forge inheritance");

    assert_eq!(merged.id, "1.21.6-forge-56.0.4");
    assert_eq!(merged.inherits_from.as_deref(), Some("1.21.6"));
    assert_eq!(
        merged.main_class.as_deref(),
        Some("net.minecraftforge.bootstrap.ForgeBootstrap")
    );
    assert_eq!(merged.asset_index, vanilla.asset_index);
    assert_eq!(
        merged.downloads.as_ref().unwrap().client,
        vanilla.downloads.as_ref().unwrap().client
    );
    assert!(merged
        .libraries
        .iter()
        .any(|library| { library.name.starts_with("net.minecraftforge:forge:") }));
    assert!(
        merged.arguments.as_ref().unwrap().game.len()
            > vanilla.arguments.as_ref().unwrap().game.len()
    );

    let keys = merged
        .libraries
        .iter()
        .map(|library| library_key(&library.name))
        .collect::<Vec<_>>();
    assert_eq!(
        keys.iter().collect::<std::collections::BTreeSet<_>>().len(),
        keys.len()
    );
}

#[test]
fn rejects_parent_mismatch_and_missing_inherited_launch_fields() {
    let vanilla = parse_version_metadata(VERSION_FULL).expect("parse vanilla fixture");
    let forge = parse_version_metadata(FORGE_VERSION).expect("parse Forge fixture");
    assert!(merge_inherited(&forge, vanilla.clone()).is_err());

    let mut incomplete = vanilla.clone();
    incomplete.asset_index = None;
    incomplete.downloads = None;
    let child = parse_version_metadata(FORGE_VERSION).expect("parse Forge fixture");
    assert!(merge_inherited(&incomplete, child).is_err());
}

#[test]
fn evaluates_ordered_rules_os_arch_and_features() {
    let rules: Vec<Rule> = serde_json::from_str(
        r#"[
          {"action":"allow"},
          {"action":"disallow","os":{"name":"osx"}},
          {"action":"allow","os":{"name":"windows","arch":"^(x64|amd64)$"},"features":{"has_custom_resolution":true}}
        ]"#,
    )
    .expect("parse rules");
    let no_features = BTreeMap::new();
    assert!(evaluate_rules(
        Some(&rules),
        &platform(OsName::Windows, "x86_64"),
        &no_features
    ));
    assert!(!evaluate_rules(
        Some(&rules),
        &platform(OsName::Osx, "aarch64"),
        &no_features
    ));

    let mut features = BTreeMap::new();
    features.insert("has_custom_resolution".to_owned(), true);
    assert!(evaluate_rules(
        Some(&rules),
        &platform(OsName::Windows, "amd64"),
        &features
    ));

    let arch_rule: Vec<Rule> = serde_json::from_str(r#"[{"action":"allow","os":{"arch":"x86"}}]"#)
        .expect("parse x86 rule");
    assert!(evaluate_rules(
        Some(&arch_rule),
        &platform(OsName::Windows, "i686"),
        &no_features
    ));
    assert!(!evaluate_rules(
        Some(&arch_rule),
        &platform(OsName::Windows, "x86_64"),
        &no_features
    ));
    assert!(evaluate_rules(
        None,
        &platform(OsName::Linux, "x86_64"),
        &no_features
    ));
    assert!(!evaluate_rules(
        Some(&[]),
        &platform(OsName::Linux, "x86_64"),
        &no_features
    ));
}

#[test]
fn resolves_modern_conditional_and_legacy_arguments() {
    let version = parse_version_metadata(VERSION_FULL).expect("parse version fixture");
    let target = platform(OsName::Windows, "x86_64");
    let values = BTreeMap::from([
        ("auth_player_name".to_owned(), "Tester".to_owned()),
        ("unknown".to_owned(), "".to_owned()),
    ]);
    let no_features = BTreeMap::new();
    let args = resolve_game_arguments(&version, &values, &target, &no_features);
    assert_eq!(args[0], "--username");
    assert_eq!(args[1], "Tester");
    assert!(!args.iter().any(|argument| argument == "--demo"));
    assert!(!args.iter().any(|argument| argument == "--width"));

    let mut features = BTreeMap::new();
    features.insert("has_custom_resolution".to_owned(), true);
    let args = resolve_game_arguments(&version, &values, &target, &features);
    assert!(args.windows(2).any(|pair| pair == ["--width", ""]));
    assert!(
        resolve_jvm_arguments(&version, &values, &target, &no_features)
            .iter()
            .any(|argument| argument.contains("HeapDumpPath"))
    );
    assert!(
        !resolve_jvm_arguments(&version, &values, &target, &no_features)
            .iter()
            .any(|argument| argument == "-Xss1M")
    );

    let legacy: VersionMetadata = serde_json::from_str(
        r#"{"id":"old","mainClass":"Main","minecraftArguments":"--username ${auth_player_name} --gameDir ${game_directory}"}"#,
    )
    .expect("parse legacy arguments");
    let mut legacy_values = values;
    legacy_values.insert("game_directory".to_owned(), "C:\\Minecraft User".to_owned());
    assert_eq!(
        resolve_game_arguments(&legacy, &legacy_values, &target, &no_features),
        ["--username", "Tester", "--gameDir", "C:\\Minecraft User"]
    );
}

#[test]
fn validates_asset_index_hashes_and_conflicting_sizes() {
    let good = r#"{"objects":{"one":{"hash":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","size":0},"two":{"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":0}}}"#;
    let index = parse_asset_index(good).expect("same hash and size are valid");
    assert_eq!(index.objects.len(), 2);

    let bad_hash = r#"{"objects":{"bad":{"hash":"not-a-sha1","size":1}}}"#;
    assert!(parse_asset_index(bad_hash).is_err());
    let conflicting = r#"{"objects":{"one":{"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":1},"two":{"hash":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","size":2}}}"#;
    assert!(parse_asset_index(conflicting).is_err());
    let negative =
        r#"{"objects":{"bad":{"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":-1}}}"#;
    assert!(parse_asset_index(negative).is_err());
}
