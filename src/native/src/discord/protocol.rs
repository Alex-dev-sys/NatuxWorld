use std::io;

use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub(super) const HANDSHAKE: u32 = 0;
pub(super) const FRAME: u32 = 1;
pub(super) const CLOSE: u32 = 2;
pub(super) const PING: u32 = 3;
pub(super) const PONG: u32 = 4;
pub(super) const MAX_FRAME_BYTES: usize = 64 * 1024;

pub(super) async fn send<S: AsyncWrite + Unpin>(
    stream: &mut S,
    opcode: u32,
    body: &[u8],
) -> io::Result<()> {
    if body.len() > MAX_FRAME_BYTES {
        return Err(invalid_frame());
    }
    stream.write_all(&opcode.to_le_bytes()).await?;
    stream.write_all(&(body.len() as u32).to_le_bytes()).await?;
    stream.write_all(body).await?;
    stream.flush().await
}

pub(super) async fn receive<S: AsyncRead + Unpin>(stream: &mut S) -> io::Result<(u32, Vec<u8>)> {
    let mut header = [0_u8; 8];
    stream.read_exact(&mut header).await?;
    let opcode = u32::from_le_bytes(header[..4].try_into().expect("four-byte opcode"));
    let length = u32::from_le_bytes(header[4..].try_into().expect("four-byte length")) as usize;
    if opcode > PONG || length > MAX_FRAME_BYTES {
        return Err(invalid_frame());
    }
    let mut body = vec![0; length];
    stream.read_exact(&mut body).await?;
    Ok((opcode, body))
}

pub(super) async fn handshake<S: AsyncRead + AsyncWrite + Unpin>(
    stream: &mut S,
    client_id: &str,
) -> io::Result<()> {
    send(
        stream,
        HANDSHAKE,
        &serde_json::to_vec(&json!({ "v": 1, "client_id": client_id }))?,
    )
    .await?;
    let payload = next_payload(stream).await?;
    if payload.get("cmd").and_then(Value::as_str) != Some("DISPATCH")
        || payload.get("evt").and_then(Value::as_str) != Some("READY")
    {
        return Err(invalid_frame());
    }
    Ok(())
}

pub(super) async fn set_activity<S: AsyncRead + AsyncWrite + Unpin>(
    stream: &mut S,
    activity: Option<Value>,
) -> io::Result<()> {
    let nonce = uuid::Uuid::new_v4().to_string();
    let request = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce
    });
    send(stream, FRAME, &serde_json::to_vec(&request)?).await?;
    for _ in 0..16 {
        let payload = next_payload(stream).await?;
        if payload.get("nonce").and_then(Value::as_str) == Some(nonce.as_str()) {
            if payload.get("cmd").and_then(Value::as_str) != Some("SET_ACTIVITY")
                || payload.get("evt").and_then(Value::as_str) == Some("ERROR")
            {
                return Err(invalid_frame());
            }
            return Ok(());
        }
    }
    Err(invalid_frame())
}

async fn next_payload<S: AsyncRead + AsyncWrite + Unpin>(stream: &mut S) -> io::Result<Value> {
    for _ in 0..16 {
        let (opcode, body) = receive(stream).await?;
        match opcode {
            FRAME => return serde_json::from_slice(&body).map_err(|_| invalid_frame()),
            PING => send(stream, PONG, &body).await?,
            _ => return Err(invalid_frame()),
        }
    }
    Err(invalid_frame())
}

fn invalid_frame() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "invalid Discord RPC frame")
}
