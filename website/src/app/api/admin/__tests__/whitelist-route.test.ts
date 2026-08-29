import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { GET, POST } from '@/app/api/admin/whitelist/route'

function req(body?: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    json: async () => body ?? {},
  } as unknown as import('next/server').NextRequest
}

describe('admin whitelist route', () => {
  beforeEach(() => { auditCreate.mockReset(); process.env.RCON_MOCK = 'true'; delete process.env.RCON_MOCK_FAIL })

  it('lists whitelisted players', async () => {
    const res = await GET(req())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.players).toEqual(['steve', 'alex', 'notch'])
  })

  it('adds a player and audits it', async () => {
    const res = await POST(req({ action: 'add', username: 'steve' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(auditCreate).toHaveBeenCalledOnce()
    expect(auditCreate.mock.calls[0][0].data.action).toBe('whitelist.add')
  })

  it('rejects an invalid username with 400 and does not audit', async () => {
    const res = await POST(req({ action: 'add', username: 'bad name!' }))
    expect(res.status).toBe(400)
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('rejects an unknown action with 400', async () => {
    const res = await POST(req({ action: 'nuke', username: 'steve' }))
    expect(res.status).toBe(400)
  })
})
