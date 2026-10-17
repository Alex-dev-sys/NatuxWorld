use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};

use super::{activity, protocol, run_session, DiscordPresence};
use crate::cancellation::CancellationToken;

const TEST_ID: &str = "123456789012345678";

async fn read_json<S: AsyncRead + Unpin>(stream: &mut S, expected_opcode: u32) -> Value {
    let (opcode, body) = protocol::receive(stream)
        .await
        .expect("receive fake IPC request");
    assert_eq!(opcode, expected_opcode);
    serde_json::from_slice(&body).expect("JSON RPC payload")
}

async fn send_json<S: AsyncWrite + Unpin>(stream: &mut S, opcode: u32, payload: Value) {
    protocol::send(stream, opcode, &serde_json::to_vec(&payload).unwrap())
        .await
        .unwrap();
}

async fn fake_discord_session<S: AsyncRead + AsyncWrite + Unpin>(
    mut server: S,
    cancellation: CancellationToken,
) {
    assert_eq!(
        read_json(&mut server, protocol::HANDSHAKE).await,
        json!({ "v": 1, "client_id": TEST_ID })
    );
    send_json(
        &mut server,
        protocol::FRAME,
        json!({ "cmd": "DISPATCH", "evt": "READY", "data": {} }),
    )
    .await;
    let request = read_json(&mut server, protocol::FRAME).await;
    assert_eq!(request["cmd"], "SET_ACTIVITY");
    assert_eq!(request["args"]["pid"], std::process::id());
    assert_eq!(request["args"]["activity"]["state"], "TestPlayer");
    assert_eq!(request["args"]["activity"]["details"], "Играет на сервере");
    assert!(
        request["args"]["activity"]["timestamps"]["start"]
            .as_u64()
            .unwrap()
            > 1_000_000_000
    );
    send_json(
        &mut server,
        protocol::FRAME,
        json!({ "cmd": "SET_ACTIVITY", "evt": null, "nonce": request["nonce"] }),
    )
    .await;
    protocol::send(&mut server, protocol::PING, b"heartbeat")
        .await
        .unwrap();
    assert_eq!(
        protocol::receive(&mut server).await.unwrap(),
        (protocol::PONG, b"heartbeat".to_vec())
    );
    cancellation.cancel();
    let clear = read_json(&mut server, protocol::FRAME).await;
    assert!(clear["args"]["activity"].is_null());
    send_json(
        &mut server,
        protocol::FRAME,
        json!({ "cmd": "SET_ACTIVITY", "evt": null, "nonce": clear["nonce"] }),
    )
    .await;
    assert_eq!(read_json(&mut server, protocol::CLOSE).await, json!({}));
}

#[test]
fn blank_and_malformed_client_ids_never_start_an_ipc_task() {
    // Intentionally no Tokio runtime: disabled configurations must never even spawn.
    for id in [
        "",
        "wrong",
        "123",
        "12345678901234567\n",
        "../../discord-ipc-0",
    ] {
        let presence = DiscordPresence::start_with_id(id, "TestPlayer", None);
        assert!(presence.cancellation.is_none());
        assert!(presence.task.is_none());
    }
}

#[test]
fn activity_contains_only_bounded_public_fields() {
    let payload = activity(&"я".repeat(500), None);
    assert!(payload["state"].as_str().unwrap().len() <= 128);
    assert!(payload["assets"]["large_text"].as_str().unwrap().len() <= 128);
    assert!(!payload.to_string().contains("token"));
}

#[tokio::test]
async fn ipc_session_sets_presence_answers_ping_and_clears_on_game_end() {
    let (client, server) = tokio::io::duplex(16 * 1024);
    let cancellation = CancellationToken::default();
    let client_task = run_session(
        client,
        TEST_ID,
        activity("TestPlayer", Some("test.local")),
        cancellation.clone(),
    );
    tokio::time::timeout(Duration::from_secs(4), async {
        let (result, ()) = tokio::join!(client_task, fake_discord_session(server, cancellation));
        result.unwrap();
    })
    .await
    .expect("bounded RPC lifecycle");
}

#[tokio::test]
async fn oversized_ipc_frame_is_rejected_before_allocation_or_reading_body() {
    let (mut server, mut client) = tokio::io::duplex(32);
    server
        .write_all(&protocol::FRAME.to_le_bytes())
        .await
        .unwrap();
    server
        .write_all(&((protocol::MAX_FRAME_BYTES as u32) + 1).to_le_bytes())
        .await
        .unwrap();
    let error = protocol::receive(&mut client).await.unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
}

#[tokio::test]
async fn cancellation_interrupts_a_discord_client_that_never_completes_handshake() {
    let (client, _unresponsive_server) = tokio::io::duplex(16 * 1024);
    let token = CancellationToken::default();
    let worker_token = token.clone();
    let started = Instant::now();
    let worker = tokio::spawn(run_session(
        client,
        TEST_ID,
        activity("TestPlayer", None),
        worker_token,
    ));
    token.cancel();
    tokio::time::timeout(Duration::from_secs(2), worker)
        .await
        .expect("cancel must not wait for RPC handshake")
        .unwrap()
        .unwrap();
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[cfg(windows)]
#[tokio::test]
async fn windows_named_pipe_runs_the_same_rpc_lifecycle_without_discord() {
    use tokio::net::windows::named_pipe::{ClientOptions, ServerOptions};

    let path = format!(r"\\?\pipe\natux-discord-test-{}", uuid::Uuid::new_v4());
    let server = ServerOptions::new()
        .first_pipe_instance(true)
        .create(&path)
        .unwrap();
    let client = ClientOptions::new().open(&path).unwrap();
    server.connect().await.unwrap();
    let cancellation = CancellationToken::default();
    tokio::time::timeout(Duration::from_secs(4), async {
        let (result, ()) = tokio::join!(
            run_session(
                client,
                TEST_ID,
                activity("TestPlayer", Some("test.local")),
                cancellation.clone()
            ),
            fake_discord_session(server, cancellation)
        );
        result.unwrap();
    })
    .await
    .expect("bounded named-pipe RPC lifecycle");
}

#[cfg(unix)]
#[tokio::test]
async fn unix_socket_runs_the_same_rpc_lifecycle_without_discord() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("discord-test.sock");
    let listener = tokio::net::UnixListener::bind(&path).unwrap();
    let client = tokio::net::UnixStream::connect(&path).await.unwrap();
    let (server, _) = listener.accept().await.unwrap();
    let cancellation = CancellationToken::default();
    tokio::time::timeout(Duration::from_secs(4), async {
        let (result, ()) = tokio::join!(
            run_session(
                client,
                TEST_ID,
                activity("TestPlayer", Some("test.local")),
                cancellation.clone()
            ),
            fake_discord_session(server, cancellation)
        );
        result.unwrap();
    })
    .await
    .expect("bounded Unix-socket RPC lifecycle");
}
