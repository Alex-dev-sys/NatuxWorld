import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Order } from '@/lib/types'

const lease = vi.hoisted(() => ({ renew: vi.fn(), write: vi.fn() }))
vi.mock('@/lib/productStore', () => ({ getProductById: vi.fn() }))
vi.mock('@/lib/store', () => ({
  renewDeliveryLease: lease.renew,
  updateOrderIfOwned: lease.write,
  updateOrder: vi.fn(),
  DELIVERY_LEASE_MS: 300,
}))

// A scriptable stand-in for the real RCON client. `sent` records every command
// that reached the server, which is what "delivered twice" actually means.
const sent: string[] = []
let connectFails = 0
let sendBehaviour: (cmd: string, callIndex: number) => string | Error | Promise<string> = () => 'OK'

vi.mock('rcon-client', () => ({
  Rcon: class {
    private calls = 0
    async connect() {
      if (connectFails > 0) {
        connectFails -= 1
        throw new Error('ECONNREFUSED')
      }
    }
    async send(cmd: string) {
      sent.push(cmd)
      const outcome = sendBehaviour(cmd, this.calls++)
      if (outcome instanceof Error) throw outcome
      return outcome
    }
    async end() {}
  },
}))

import { executeRcon } from '@/lib/rcon'
import { fulfillOrder } from '@/lib/fulfillment'

const order: Order = {
  id: 'order-1', publicId: 'public-1', productId: 'baron', productName: 'Baron',
  variantDuration: '30d', variantDurationLabel: '30 дней', price: 99,
  username: 'steve', status: 'delivery_pending', createdAt: new Date().toISOString(),
  fulfillmentCommands: ['first', 'second'],
}

describe('executeRcon retry safety', () => {
  beforeEach(() => {
    delete process.env.RCON_MOCK
    delete process.env.RCON_MOCK_FAIL
    sent.length = 0
    connectFails = 0
    sendBehaviour = () => 'OK'
    lease.renew.mockReset().mockResolvedValue(true)
    lease.write.mockReset().mockResolvedValue(null)
  })
  afterEach(() => { vi.useRealTimers() })

  it('sends nothing when initial delivery ownership is lost', async () => {
    lease.renew.mockResolvedValue(false)
    await fulfillOrder(order, 'attempt-1')
    expect(sent).toEqual([])
    expect(lease.write).toHaveBeenCalledWith('public-1', 'attempt-1', expect.objectContaining({
      status: 'delivery_failed', rconCommands: [],
    }))
  })

  it('checks ownership again before sending the next command', async () => {
    sendBehaviour = () => { lease.renew.mockResolvedValue(false); return 'OK' }
    await fulfillOrder(order, 'attempt-1')
    expect(sent).toEqual(['first'])
    expect(lease.write).toHaveBeenCalledWith('public-1', 'attempt-1', expect.objectContaining({
      status: 'delivery_failed', rconCommands: ['first'],
    }))
  })

  it('a failed heartbeat permanently cancels remaining commands, preserving an in-flight reply', async () => {
    vi.useFakeTimers()
    let finish: (value: string) => void = () => {}
    let started: () => void = () => {}
    const sending = new Promise<void>(resolve => { started = resolve })
    sendBehaviour = () => new Promise<string>(resolve => { finish = resolve; started() })
    const delivery = fulfillOrder(order, 'attempt-1')
    await sending
    expect(sent).toEqual(['first'])
    lease.renew.mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(100)
    // A later recovery cannot revive the attempt after a failed ownership check.
    lease.renew.mockResolvedValue(true)
    finish('OK')
    await delivery
    expect(sent).toEqual(['first'])
    expect(lease.write).toHaveBeenCalledWith('public-1', 'attempt-1', expect.objectContaining({
      status: 'delivery_failed', rconCommands: ['first'],
    }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never re-sends a command whose response was lost', async () => {
    // The grant executes server-side but the reply never arrives.
    sendBehaviour = (cmd) =>
      cmd === 'grant rank' ? new Error('socket hang up') : 'OK'

    const result = await executeRcon(['grant rank'])

    expect(result.success).toBe(false)
    // Exactly one execution — retrying here is what granted a purchase 3×.
    expect(sent).toEqual(['grant rank'])
    expect(result.unknownCommand).toBe('grant rank')
    // An unconfirmed command is not progress.
    expect(result.commands).toEqual([])
  })

  it('does not re-send a command the server explicitly rejected', async () => {
    sendBehaviour = () => 'Unknown command'

    const result = await executeRcon(['bogus'])

    expect(result.success).toBe(false)
    expect(sent).toEqual(['bogus'])
    // Rejected means it did not apply, so there is no unknown outcome.
    expect(result.unknownCommand).toBeUndefined()
  })

  it('retries only when nothing reached the server', async () => {
    connectFails = 1
    const result = await executeRcon(['grant rank'])

    expect(result.success).toBe(true)
    expect(sent).toEqual(['grant rank'])
  })

  it('keeps confirmed commands and stops at the lost one', async () => {
    sendBehaviour = (cmd) => (cmd === 'second' ? new Error('socket hang up') : 'OK')

    const result = await executeRcon(['first', 'second', 'third'])

    expect(result.commands).toEqual(['first'])
    expect(result.unknownCommand).toBe('second')
    expect(sent).toEqual(['first', 'second'])
  })

  it('skips the prefix a previous attempt already confirmed', async () => {
    const result = await executeRcon(['first', 'second'], 1)

    expect(result.success).toBe(true)
    // `first` was done earlier; only the remainder goes out.
    expect(sent).toEqual(['second'])
    expect(result.commands).toEqual(['first', 'second'])
  })

  it('records no progress when the mock fail mode refuses the connection', async () => {
    process.env.RCON_MOCK = 'true'
    process.env.RCON_MOCK_FAIL = 'true'

    const result = await executeRcon(['grant rank'])

    expect(result.success).toBe(false)
    // Unsent commands must not be stored as executed — doing so let the next
    // retry believe the order was fully delivered.
    expect(result.commands).toEqual([])
  })
})
