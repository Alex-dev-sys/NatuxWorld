use std::path::Path;

use super::{ensure_sufficient_space_with, MIN_FREE_BYTES};

#[test]
fn refuses_launch_below_the_electron_disk_space_threshold_before_probing_downloads() {
    let mut probed_path = None;
    let result = ensure_sufficient_space_with(Path::new("minecraft"), |path| {
        probed_path = Some(path.to_path_buf());
        Ok(MIN_FREE_BYTES - 1)
    });

    assert_eq!(probed_path.as_deref(), Some(Path::new("minecraft")));
    let error = result.expect_err("low free space must stop the pipeline");
    assert!(error.contains("1.5 GB"));
}

#[test]
fn allows_launch_at_the_electron_disk_space_threshold() {
    ensure_sufficient_space_with(Path::new("minecraft"), |_| Ok(MIN_FREE_BYTES))
        .expect("exactly 1.5 GiB meets the threshold");
}

#[test]
fn reports_disk_probe_failure_instead_of_starting_without_a_check() {
    let result = ensure_sufficient_space_with(Path::new("minecraft"), |_| {
        Err("probe unavailable".to_owned())
    });

    assert_eq!(result, Err("probe unavailable".to_owned()));
}
