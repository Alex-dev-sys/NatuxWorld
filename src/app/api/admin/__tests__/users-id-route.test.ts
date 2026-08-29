import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  order: { updateMany: vi.fn() },
  gameEvent: { updateMany: vi.fn() },
  gameToken: { deleteMany: vi.fn() },
  twoFactorBackupCode: { deleteMany: vi.fn() },
  adminAudit: { create: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

import { PATCH } from '@/app/api/admin/users/[id]/route'

function req(body: Record<string, unknown>) {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }), json: async () => body } as unknown as import('next/server').NextRequest
}
const ctx = (id: string) => ({ params: { id } })
const theUser = { id: 'u1', username: 'steve', email: 'steve@old.com' }

beforeEach(() => {
  Object.values(db).forEach(v => { if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockReset?.(); else Object.values(v).forEach(f => (f as ReturnType<typeof vi.fn>).mockReset()) })
  db.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops))
  db.user.findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string; username?: string } }) =>
    where.id === 'u1' ? Promise.resolve(theUser) : Promise.resolve(null))
  db.user.update.mockResolvedValue(theUser)
  db.order.updateMany.mockResolvedValue({}); db.gameEvent.updateMany.mockResolvedValue({})
  db.gameToken.deleteMany.mockResolvedValue({}); db.twoFactorBackupCode.deleteMany.mockResolvedValue({})
})

describe('admin user PATCH — Phase 4 actions', () => {
  it('set-email rejects an invalid email', async () => {
    const res = await PATCH(req({ action: 'set-email', email: 'nope' }), ctx('u1'))
    expect(res.status).toBe(400)
  })

  it('set-email updates and forces re-verify + session bump', async () => {
    const res = await PATCH(req({ action: 'set-email', email: 'new@mail.com' }), ctx('u1'))
    expect(res.status).toBe(200)
    const data = db.user.update.mock.calls[0][0].data
    expect(data.email).toBe('new@mail.com')
    expect(data.emailVerified).toBe(false)
    expect(data.tokenVersion).toEqual({ increment: 1 })
    expect(db.adminAudit.create).toHaveBeenCalledOnce()
  })

  it('set-username rejects a bad nick and migrates orders on success', async () => {
    expect((await PATCH(req({ action: 'set-username', username: 'x' }), ctx('u1'))).status).toBe(400)
    const res = await PATCH(req({ action: 'set-username', username: 'steve2' }), ctx('u1'))
    expect(res.status).toBe(200)
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { username: 'steve' }, data: { username: 'steve2' } })
  })

  it('reset-password returns a temp password but never logs it', async () => {
    const res = await PATCH(req({ action: 'reset-password' }), ctx('u1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(typeof data.tempPassword).toBe('string')
    expect(data.tempPassword.length).toBe(12)
    const auditParams = db.adminAudit.create.mock.calls[0][0].data
    expect(JSON.stringify(auditParams)).not.toContain(data.tempPassword)
    expect(db.gameToken.deleteMany).toHaveBeenCalledOnce()
  })

  it('reset-2fa clears 2FA fields and backup codes', async () => {
    const res = await PATCH(req({ action: 'reset-2fa' }), ctx('u1'))
    expect(res.status).toBe(200)
    const data = db.user.update.mock.calls[0][0].data
    expect(data.twoFactorEnabled).toBe(false)
    expect(data.totpSecretEnc).toBeNull()
    expect(data.tokenVersion).toEqual({ increment: 1 })
    expect(db.twoFactorBackupCode.deleteMany).toHaveBeenCalledOnce()
    expect(db.gameToken.deleteMany).toHaveBeenCalledOnce()
  })
})
