import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { POST } from '@/app/api/admin/player/route'

function req(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.8' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

describe('admin player route', () => {
  beforeEach(() => { auditCreate.mockReset(); process.env.RCON_MOCK = 'true' })

  it('gates a confirm-tier action behind confirm', async () => {
    const res = await POST(req({ action: 'kick', username: 'steve', reason: 'x' }))
    const data = await res.json()
    expect(data.needConfirm).toBe(true)
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('executes when confirmed and audits as player.kick', async () => {
    const res = await POST(req({ action: 'kick', username: 'steve', reason: 'x', confirm: true }))
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(auditCreate).toHaveBeenCalledOnce()
    expect(auditCreate.mock.calls[0][0].data.action).toBe('player.kick')
    expect(auditCreate.mock.calls[0][0].data.target).toBe('steve')
  })

  it('runs broadcast (safe tier) without confirm', async () => {
    const res = await POST(req({ action: 'broadcast', message: 'server restart soon' }))
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('returns 400 on invalid input', async () => {
    const res = await POST(req({ action: 'heal', username: 'bad;name', confirm: true }))
    expect(res.status).toBe(400)
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
