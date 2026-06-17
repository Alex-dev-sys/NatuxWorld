import { Client } from 'ssh2'

export type McBridgeCommand = 'status' | 'start' | 'stop' | 'restart' | `console ${number}` | 'console'

function getConfig() {
  const keyB64 = process.env.MC_SSH_KEY_B64
  if (!keyB64) throw new Error('MC_SSH_KEY_B64 not set')
  return {
    host: process.env.MC_SSH_HOST ?? 'host.docker.internal',
    port: 22,
    username: process.env.MC_SSH_USER ?? 'agfa',
    privateKey: Buffer.from(keyB64, 'base64'),
  }
}

export function mcBridge(command: McBridgeCommand): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let output = ''

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { conn.end(); return reject(err) }
        stream.on('data', (chunk: Buffer) => { output += chunk.toString() })
        stream.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
        stream.on('close', () => { conn.end(); resolve(output.trim()) })
      })
    })

    conn.on('error', reject)
    conn.connect({ ...getConfig(), readyTimeout: 5000 })
  })
}
