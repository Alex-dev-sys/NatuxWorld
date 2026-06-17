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

// Mock mode for dev/CI without a live SSH host. Enable with MC_MOCK=true.
function mockOutput(command: McBridgeCommand): string {
  if (command === 'status') return '● minecraft.service - active (running)\n   uptime: 3h 12m   players: 4/40   tps: 19.9'
  if (command === 'start') return 'minecraft: starting tmux session…'
  if (command === 'stop') return 'minecraft: stop signal sent'
  if (command === 'restart') return 'minecraft: restarting…'
  if (command.startsWith('console')) {
    const n = Math.min(Math.max(Number(command.split(' ')[1]) || 100, 1), 500)
    return Array.from({ length: Math.min(n, 8) }, (_, i) =>
      `[12:0${i}:00] [Server thread/INFO]: mock log line ${i + 1}`).join('\n')
  }
  return ''
}

export function mcBridge(command: McBridgeCommand): Promise<string> {
  if (process.env.MC_MOCK === 'true') return Promise.resolve(mockOutput(command))
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
