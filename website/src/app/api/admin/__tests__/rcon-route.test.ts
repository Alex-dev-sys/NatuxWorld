import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { POST } from '@/app/api/admin/rcon/route'

function req(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7', 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

describe('admin rcon route', () => {
  beforeEach(() => { auditCreate.mockReset(); process.env.RCON_MOCK = 'true' })

  it('runs a safe command without confirm and audits it', async () => {
    const res = await POST(req({ command: 'list' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(auditCreate).toHaveBeenCalledOnce()
  })

  it('requires confirm for a confirm-tier command and does NOT audit', async () => {
    const res = await POST(req({ command: 'op steve' }))
    const data = await res.json()
    expect(data.needConfirm).toBe(true)
    expect(data.tier).toBe('confirm')
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('runs a confirm-tier command when confirm=true', async () => {
    const res = await POST(req({ command: 'op steve', confirm: true }))
    const data = await res.json()
    expect(data.needConfirm).toBeUndefined()
    expect(auditCreate).toHaveBeenCalledOnce()
  })
})
