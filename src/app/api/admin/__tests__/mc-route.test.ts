import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { POST } from '@/app/api/admin/mc/route'

function req(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7', 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

describe('admin mc route', () => {
  beforeEach(() => { auditCreate.mockReset(); process.env.MC_MOCK = 'true' })

  it('returns status output and does NOT audit a read-only action', async () => {
    const res = await POST(req({ action: 'status' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.output).toContain('running')
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('audits lifecycle actions (start/stop/restart)', async () => {
    for (const action of ['start', 'stop', 'restart']) {
      auditCreate.mockReset()
      const res = await POST(req({ action }))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(auditCreate).toHaveBeenCalledOnce()
      expect(auditCreate.mock.calls[0][0].data.action).toBe(`server.${action}`)
    }
  })

  it('clamps console line count and returns log text', async () => {
    const res = await POST(req({ action: 'console', lines: 5 }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.output).toContain('mock log line')
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('rejects an unknown action with 400', async () => {
    const res = await POST(req({ action: 'rm-rf' }))
    expect(res.status).toBe(400)
  })

  it('rejects a missing action with 400', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })
})
