export interface RconResult {
  success: boolean
  commands: string[]
  error?: string
}

export function buildCommands(
  templates: string[],
  vars: {
    username: string
    rank: string
    duration: string
    durationDays: string
    orderId: string
    price: number
  }
): string[] {
  return templates.map(cmd =>
    cmd
      .replace(/{username}/g, vars.username)
      .replace(/{rank}/g, vars.rank)
      .replace(/{duration}/g, vars.duration)
      .replace(/{duration_days}/g, vars.durationDays)
      .replace(/{order_id}/g, vars.orderId)
      .replace(/{price}/g, String(vars.price))
  )
}

export async function executeRcon(commands: string[]): Promise<RconResult> {
  // MOCK — replace with real RCON in production:
  //
  // import { Rcon } from 'rcon-client'
  // const rcon = new Rcon({
  //   host: process.env.RCON_HOST!,
  //   port: Number(process.env.RCON_PORT),
  //   password: process.env.RCON_PASSWORD!,
  // })
  // try {
  //   await rcon.connect()
  //   for (const cmd of commands) await rcon.send(cmd)
  //   await rcon.end()
  //   return { success: true, commands }
  // } catch (err) {
  //   return { success: false, commands, error: String(err) }
  // }

  console.log('[MOCK RCON] Executing commands:', commands)

  if (process.env.RCON_MOCK_FAIL === 'true') {
    return { success: false, commands, error: 'Connection refused (mock fail mode)' }
  }

  await new Promise(r => setTimeout(r, 300))
  return { success: true, commands }
}
