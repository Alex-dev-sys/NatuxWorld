import { describe, it, expect } from 'vitest'
import { generateAppPassword, hashAppPassword, verifyAppPassword } from '@/lib/appPassword'

describe('appPassword', () => {
  it('generates a readable grouped password', () => {
    const p = generateAppPassword()
    expect(p).toMatch(/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/)
  })

  it('hashes and verifies against a set', async () => {
    const p = generateAppPassword()
    const h = await hashAppPassword(p)
    expect(await verifyAppPassword(p, [h])).toBe(true)
    expect(await verifyAppPassword('wrong-pass-word-xxxx', [h])).toBe(false)
  })

  it('returns false against an empty set', async () => {
    expect(await verifyAppPassword('anything-here-now-yep', [])).toBe(false)
  })
})
