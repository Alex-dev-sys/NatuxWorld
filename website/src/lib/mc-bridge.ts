import { Client } from 'ssh2'

export type McBridgeCommand = 'status' | 'start' | 'stop' | 'restart' | `console ${number}` | 'console'

function getConfig() {
  const keyB64 = process.env.MC_SSH_KEY_B64
  if (!keyB64) throw new Error('MC_SSH_KEY_B64 not set')
  const fingerprint = process.env.MC_SSH_HOST_KEY_FINGERPRINT
  if (!fingerprint) throw new Error('MC_SSH_HOST_KEY_FINGERPRINT not set')
  return {
    host: process.env.MC_SSH_HOST ?? 'host.docker.internal',
    port: 22,
    username: process.env.MC_SSH_USER ?? 'agfa',
    privateKey: Buffer.from(keyB64, 'base64'),
    hostHash: 'sha256',
    hostVerifier: (received: string) => received === fingerprint,
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
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      conn.end()
      reject(new Error('Minecraft SSH command timed out'))
    }, 15_000)
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      conn.end()
      reject(error)
    }

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return fail(err)
        const append = (chunk: Buffer) => {
          if (output.length >= 1_048_576) return fail(new Error('Minecraft SSH output exceeded limit'))
          output += chunk.toString().slice(0, 1_048_576 - output.length)
        }
        stream.on('data', append)
        stream.stderr.on('data', append)
        stream.on('close', () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          conn.end()
          resolve(output.trim())
        })
      })
    })

    conn.on('error', fail)
    conn.connect({ ...getConfig(), readyTimeout: 5000 })
  })
}
