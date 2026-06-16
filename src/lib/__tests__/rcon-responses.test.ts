import { describe, it, expect, beforeEach } from 'vitest'
import { executeRcon } from '@/lib/rcon'

describe('executeRcon responses (mock mode)', () => {
  beforeEach(() => { process.env.RCON_MOCK = 'true'; delete process.env.RCON_MOCK_FAIL })

  it('returns a responses array aligned to commands', async () => {
    const r = await executeRcon(['say hi'])
    expect(r.success).toBe(true)
    expect(Array.isArray(r.responses)).toBe(true)
    expect(r.responses).toHaveLength(1)
  })

  it('returns a parseable roster for `list`', async () => {
    const r = await executeRcon(['list'])
    expect(r.responses?.[0]).toMatch(/players online/i)
  })
})
