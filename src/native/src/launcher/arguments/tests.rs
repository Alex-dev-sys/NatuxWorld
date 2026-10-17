use std::fs;
use std::path::Path;

use super::{build_launch_arguments, maven_path, LaunchPaths};
use crate::account::GameSessionCredentials;
use crate::metadata::parse_version_metadata;
use crate::settings::LauncherSettings;

const VERSION: &str = r#"{
  "id":"1.21.1",
  "type":"release",
  "mainClass":"net.minecraft.client.main.Main",
  "assetIndex":{"id":"17","url":"https://piston-meta.mojang.com/index.json","sha1":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":1},
  "libraries":[{"name":"com.example:library:1.0","downloads":{"artifact":{"path":"com/example/library/1.0/library-1.0.jar","url":"https://libraries.minecraft.net/library.jar","sha1":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","size":1}}}],
  "arguments":{"game":["--username","${auth_player_name}","--accessToken","${auth_access_token}"],"jvm":["-cp","${classpath}","-Dlauncher.fixture=${launcher_name}"]}
}"#;

#[test]
fn builds_game_arguments_from_native_session_and_verified_files() {
    let temp = tempfile::tempdir().expect("temporary data root");
    let root = temp.path();
    let client_dir = root.join("versions/1.21.1");
    let library_dir = root.join("libraries/com/example/library/1.0");
    fs::create_dir_all(&client_dir).expect("client directory");
    fs::create_dir_all(&library_dir).expect("library directory");
    fs::write(client_dir.join("1.21.1.jar"), b"client").expect("client jar");
    fs::write(library_dir.join("library-1.0.jar"), b"library").expect("library jar");
    let lock_agent = root.join("natux-lock-agent.jar");
    fs::write(&lock_agent, b"agent").expect("lock agent jar");
    let version = parse_version_metadata(VERSION).expect("version metadata");
    let settings = LauncherSettings::default();
    let credentials = GameSessionCredentials {
        access_token: "secret-game-token".to_owned(),
        client_token: "client-token".to_owned(),
        uuid: "0123456789abcdef0123456789abcdef".to_owned(),
        username: "TrustedUser".to_owned(),
    };

    let plan = build_launch_arguments(
        &version,
        "1.21.1",
        LaunchPaths {
            root,
            lock_agent_jar: &lock_agent,
        },
        Path::new("java"),
        &settings,
        &credentials,
        Some("play.example.org:25565"),
    )
    .expect("launch arguments");

    assert!(plan.args.iter().any(|arg| arg == "TrustedUser"));
    assert_eq!(
        plan.args.first().map(String::as_str),
        Some(format!("-javaagent:{}", lock_agent.display()).as_str())
    );
    assert!(plan.args.iter().any(|arg| arg == "secret-game-token"));
    assert!(plan.args.iter().any(|arg| arg.contains(&format!(
        "authlib-injector.jar={}/api/yggdrasil",
        crate::brand::site_origin()
    ))));
    assert!(plan
        .args
        .contains(&format!("-Dlauncher.fixture={}", crate::brand::name())));
    assert!(plan
        .args
        .windows(2)
        .any(|args| args == ["--quickPlayMultiplayer", "play.example.org:25565"]));
    let classpath = plan.args.iter().find(|arg| arg.contains("library-1.0.jar"));
    assert!(classpath.is_some());
    assert!(plan
        .args
        .iter()
        .any(|arg| arg == "net.minecraft.client.main.Main"));
}

#[test]
fn maven_coordinate_fallback_is_confined_to_normal_path_components() {
    assert_eq!(
        maven_path("org.example:library:1.2.3:client"),
        Some(Path::new("org/example/library/1.2.3/library-1.2.3-client.jar").to_path_buf())
    );
    assert!(maven_path("../../outside:library:1.0").is_none());
    assert!(maven_path("org.example:library:1.0@../outside").is_none());
}
