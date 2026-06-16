import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))

import { GET } from '@/app/api/admin/online/route'

function req() {
  return { headers: new Headers() } as unknown as import('next/server').NextRequest
}

describe('admin online route', () => {
  beforeEach(() => { process.env.RCON_MOCK = 'true' })

  it('parses the mock list into player names', async () => {
    const res = await GET(req())
    const data = await res.json()
    expect(data.online).toBe(2)
    expect(data.max).toBe(20)
    expect(data.players).toEqual(['steve', 'alex'])
  })
})
