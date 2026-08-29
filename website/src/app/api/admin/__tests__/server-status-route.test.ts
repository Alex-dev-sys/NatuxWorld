import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))

import { GET } from '@/app/api/admin/server-status/route'

function req() {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }) } as unknown as import('next/server').NextRequest
}

describe('admin server-status route', () => {
  beforeEach(() => { process.env.RCON_MOCK = 'true'; delete process.env.RCON_MOCK_FAIL })

  it('returns players and tps from RCON', async () => {
    const res = await GET(req())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.players.online).toBe(2)
    expect(data.players.players).toEqual(['steve', 'alex'])
    expect(data.tps).toEqual([20.0, 19.9, 19.8])
  })

  it('returns 502 when RCON is unavailable', async () => {
    process.env.RCON_MOCK_FAIL = 'true'
    const res = await GET(req())
    expect(res.status).toBe(502)
  })
})
