use std::ffi::OsString;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use natux_profile_lock_core::{GameLock, LockError, ProfileLock};

const READY: &str = "NATUX_LOCK_READY_V1";
const BUSY: &str = "NATUX_LOCK_BUSY_V1";

fn main() -> ExitCode {
    match parse_args(std::env::args_os().skip(1).collect()) {
        Ok((kind, user_data)) => hold(kind, &user_data),
        Err(message) => {
            eprintln!("{message}");
            ExitCode::from(64)
        }
    }
}

#[derive(Clone, Copy)]
enum Kind {
    Profile,
    Game,
}

fn parse_args(args: Vec<OsString>) -> Result<(Kind, PathBuf), String> {
    if args.len() != 4 || args[0] != "--kind" || args[2] != "--user-data" {
        return Err("usage: lock-helper --kind profile|game --user-data <path>".to_owned());
    }
    let kind = match args[1].to_str() {
        Some("profile") => Kind::Profile,
        Some("game") => Kind::Game,
        _ => return Err("lock-helper kind must be profile or game".to_owned()),
    };
    if args[3].is_empty() {
        return Err("lock-helper user-data path must not be empty".to_owned());
    }
    Ok((kind, PathBuf::from(&args[3])))
}

fn hold(kind: Kind, user_data: &std::path::Path) -> ExitCode {
    match kind {
        Kind::Profile => match ProfileLock::try_acquire(user_data) {
            Ok(Some(_guard)) => serve_until_eof(),
            Ok(None) => busy(),
            Err(error) => fail(error),
        },
        Kind::Game => match GameLock::try_acquire(user_data) {
            Ok(Some(_guard)) => serve_until_eof(),
            Ok(None) => busy(),
            Err(error) => fail(error),
        },
    }
}

fn serve_until_eof() -> ExitCode {
    if let Err(error) = announce(READY) {
        eprintln!("cannot announce lock readiness: {error}");
        return ExitCode::FAILURE;
    }
    let mut stdin = io::stdin().lock();
    let mut buffer = [0_u8; 1024];
    loop {
        match stdin.read(&mut buffer) {
            Ok(0) => return ExitCode::SUCCESS,
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => {
                eprintln!("lock-helper stdin failed: {error}");
                return ExitCode::FAILURE;
            }
        }
    }
}

fn busy() -> ExitCode {
    match announce(BUSY) {
        Ok(()) => ExitCode::from(2),
        Err(error) => {
            eprintln!("cannot announce lock contention: {error}");
            ExitCode::FAILURE
        }
    }
}

fn announce(message: &str) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{message}")?;
    stdout.flush()
}

fn fail(error: LockError) -> ExitCode {
    eprintln!("lock-helper could not safely acquire the lock: {error}");
    ExitCode::FAILURE
}
