use std::path::Path;

use tokio::process::Command;

/// Limits inherited JVM configuration so no external agent runs before the lock agent.
pub(super) fn configure_game_process_environment(command: &mut Command, profile_dir: &Path) {
    command
        .env("NATUX_PROFILE_DIR", profile_dir)
        .env_remove("JAVA_TOOL_OPTIONS")
        .env_remove("_JAVA_OPTIONS")
        .env_remove("JDK_JAVA_OPTIONS");
}

#[cfg(test)]
mod tests {
    use std::{env, path::PathBuf};

    use tokio::process::Command;

    use super::configure_game_process_environment;

    const EXPECTED_PROFILE_ENV: &str = "NATUX_LOCK_TEST_EXPECTED_PROFILE_DIR";
    const CHILD_TEST_ENV: &str = "NATUX_LOCK_TEST_CHILD";

    #[tokio::test]
    async fn java_agent_environment_is_not_inherited_by_game_process() {
        if env::var_os(CHILD_TEST_ENV).is_some() {
            for name in ["JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS"] {
                assert!(env::var_os(name).is_none(), "{name} must be removed");
            }
            assert_eq!(
                env::var("NATUX_PROFILE_DIR").expect("profile directory is set"),
                env::var(EXPECTED_PROFILE_ENV).expect("test profile directory is set"),
            );
            return;
        }

        let executable = env::current_exe().expect("resolve Rust test executable");
        let test_name = format!(
            "{}::tests::java_agent_environment_is_not_inherited_by_game_process",
            module_path!().trim_end_matches("::tests")
        );
        let profile_dir: PathBuf = env::temp_dir().join("natux-lock-agent-env-test");
        let expected_profile = profile_dir.to_string_lossy().into_owned();
        let mut command = Command::new(executable);
        command
            .args(["--exact", &test_name, "--nocapture"])
            .env(CHILD_TEST_ENV, "1")
            .env(EXPECTED_PROFILE_ENV, &expected_profile)
            .env("JAVA_TOOL_OPTIONS", "-javaagent:untrusted-agent.jar")
            .env("_JAVA_OPTIONS", "-javaagent:untrusted-agent.jar")
            .env("JDK_JAVA_OPTIONS", "-javaagent:untrusted-agent.jar");
        configure_game_process_environment(&mut command, &profile_dir);

        let output = command
            .output()
            .await
            .expect("spawn child Rust test process");
        assert!(
            output.status.success(),
            "child test failed: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );
    }
}
