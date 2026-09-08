import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  user: { updateMany: vi.fn() },
  twoFactorBackupCode: { updateMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

import { consumeSecondFactor } from '@/lib/auth'
import { hashBackupCode } from '@/lib/backupCodes'

const FUTURE = new Date(Date.now() + 60_000)

function emailUser(code: string) {
  return {
    id: 'u_1',
    twoFactorMethod: 'email',
    totpSecretEnc: null,
    twoFactorCode: hashBackupCode(code),
    twoFactorCodeExpires: FUTURE,
  }
}

describe('consumeSecondFactor', () => {
  beforeEach(() => {
    db.user.updateMany.mockReset()
    db.twoFactorBackupCode.updateMany.mockReset()
    db.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 0 })
  })

  it('accepts an emailed code exactly once', async () => {
    db.user.updateMany.mockResolvedValue({ count: 1 })
    await expect(consumeSecondFactor(emailUser('123456'), '123456')).resolves.toBe(true)
  })

  it('rejects an emailed code that another request already burned', async () => {
    // The conditional update matched nothing: someone else consumed it first.
    db.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(consumeSecondFactor(emailUser('123456'), '123456')).resolves.toBe(false)
  })

  it('falls back to a backup code and honours its consumption count', async () => {
    const user = { id: 'u_1', twoFactorMethod: 'totp', totpSecretEnc: null, twoFactorCode: null, twoFactorCodeExpires: null }
    db.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 1 })
    await expect(consumeSecondFactor(user, 'abcd-efgh')).resolves.toBe(true)

    db.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 0 })
    await expect(consumeSecondFactor(user, 'abcd-efgh')).resolves.toBe(false)
  })

  it('rejects an empty code without touching the database', async () => {
    await expect(consumeSecondFactor(emailUser('123456'), '   ')).resolves.toBe(false)
    expect(db.user.updateMany).not.toHaveBeenCalled()
    expect(db.twoFactorBackupCode.updateMany).not.toHaveBeenCalled()
  })
})
