import { describe, it, expect } from 'vitest'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

describe('backupCodes', () => {
  it('generates 10 distinct formatted codes', () => {
    const codes = generateBackupCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
  })

  it('hash is stable and not the plaintext', () => {
    const h = hashBackupCode('abcd-efgh')
    expect(h).not.toBe('abcd-efgh')
    expect(hashBackupCode('abcd-efgh')).toBe(h)
  })

  it('hash is case/whitespace-insensitive', () => {
    expect(hashBackupCode('  ABCD-EFGH ')).toBe(hashBackupCode('abcd-efgh'))
  })
})
