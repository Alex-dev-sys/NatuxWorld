//! Optional local Discord RPC. A game session owns the connection; failures are cosmetic.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncWrite};

use crate::cancellation::CancellationToken;

mod protocol;
mod transport;

const RPC_TIMEOUT: Duration = Duration::from_secs(2);
const CLEAR_TIMEOUT: Duration = Duration::from_millis(500);

/// Finishing a game clears activity; dropping on an error closes the IPC connection.
pub(crate) struct DiscordPresence {
    cancellation: Option<CancellationToken>,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl DiscordPresence {
    pub(crate) fn start(username: &str, server: Option<&str>) -> Self {
        Self::start_with_id(crate::brand::discord_client_id(), username, server)
    }

    fn start_with_id(client_id: &str, username: &str, server: Option<&str>) -> Self {
        if !valid_client_id(client_id) {
            return Self {
                cancellation: None,
                task: None,
            };
        }
        let cancellation = CancellationToken::default();
        let token = cancellation.clone();
        let id = client_id.to_owned();
        let activity = activity(username, server);
        let task = tokio::spawn(async move {
            let connected = tokio::select! {
                _ = token.cancelled() => return,
                result = tokio::time::timeout(RPC_TIMEOUT, transport::connect()) => result,
            };
            let Ok(Ok(stream)) = connected else { return };
            let _ = run_session(stream, &id, activity, token).await;
        });
        Self {
            cancellation: Some(cancellation),
            task: Some(task),
        }
    }

    pub(crate) async fn finish(mut self) {
        if let Some(token) = &self.cancellation {
            token.cancel();
        }
        if let Some(mut task) = self.task.take() {
            // Finish cleanup before another game sets activity for the same launcher PID.
            if tokio::time::timeout(RPC_TIMEOUT + CLEAR_TIMEOUT, &mut task)
                .await
                .is_err()
            {
                task.abort();
                let _ = task.await;
            }
        }
    }
}

impl Drop for DiscordPresence {
    fn drop(&mut self) {
        if let Some(token) = &self.cancellation {
            token.cancel();
        }
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}

fn valid_client_id(value: &str) -> bool {
    (17..=20).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn activity(username: &str, server: Option<&str>) -> Value {
    let state = if server.is_some() {
        username.to_owned()
    } else {
        format!("{username} · {}", crate::brand::server_host())
    };
    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    json!({
        "details": "Играет на сервере",
        "state": bounded_text(&state),
        "timestamps": { "start": started },
        "assets": { "large_image": "natux", "large_text": bounded_text(crate::brand::name()) },
        "instance": false
    })
}

fn bounded_text(value: &str) -> &str {
    let mut end = value.len().min(128);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

async fn run_session<S>(
    mut stream: S,
    client_id: &str,
    activity: Value,
    cancellation: CancellationToken,
) -> std::io::Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let initialized = tokio::select! {
        _ = cancellation.cancelled() => false,
        result = tokio::time::timeout(RPC_TIMEOUT, async {
            protocol::handshake(&mut stream, client_id).await?;
            protocol::set_activity(&mut stream, Some(activity)).await
        }) => matches!(result, Ok(Ok(()))),
    };
    if initialized {
        loop {
            tokio::select! {
                _ = cancellation.cancelled() => break,
                received = protocol::receive(&mut stream) => {
                    let Ok((opcode, body)) = received else { break };
                    if opcode == protocol::CLOSE { break; }
                    if opcode == protocol::PING
                        && !matches!(tokio::time::timeout(RPC_TIMEOUT, protocol::send(&mut stream, protocol::PONG, &body)).await, Ok(Ok(()))) {
                        break;
                    }
                }
            }
        }
    }
    // Also clear when cancellation raced with SET_ACTIVITY's acknowledgement.
    let _ = tokio::time::timeout(CLEAR_TIMEOUT, protocol::set_activity(&mut stream, None)).await;
    let _ = tokio::time::timeout(
        CLEAR_TIMEOUT,
        protocol::send(&mut stream, protocol::CLOSE, b"{}"),
    )
    .await;
    Ok(())
}

#[cfg(test)]
#[path = "discord/tests.rs"]
mod tests;
