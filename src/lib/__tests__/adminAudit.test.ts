import { describe, it, expect, vi, beforeEach } from 'vitest'

const create = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => create(...a) } } }))

import { logAdminAction } from '@/lib/adminAudit'

function req(ip = '203.0.113.5') {
  return { headers: new Headers({ 'x-forwarded-for': ip }) } as unknown as import('next/server').NextRequest
}

describe('logAdminAction', () => {
  beforeEach(() => { create.mockReset() })

  it('writes a row with action, target, params, ip, ok', async () => {
    await logAdminAction(req(), 'user.ban', { target: 'steve', params: { reason: 'x' }, ok: true })
    expect(create).toHaveBeenCalledWith({
      data: { action: 'user.ban', target: 'steve', params: { reason: 'x' }, ip: '203.0.113.5', ok: true },
    })
  })

  it('never throws when the DB write fails', async () => {
    create.mockRejectedValueOnce(new Error('db down'))
    await expect(logAdminAction(req(), 'rcon.exec', { ok: false })).resolves.toBeUndefined()
  })

  it('defaults target to null and params to empty object', async () => {
    await logAdminAction(req(), 'order.retry', { ok: true })
    expect(create).toHaveBeenCalledWith({
      data: { action: 'order.retry', target: null, params: {}, ip: '203.0.113.5', ok: true },
    })
  })
})
