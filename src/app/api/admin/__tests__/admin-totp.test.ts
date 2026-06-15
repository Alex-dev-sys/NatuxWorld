import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/adminSession', () => ({ ADMIN_SESSION_TTL_SECONDS: 60, createSessionToken: async () => 'fake.session' }))

import { POST } from '@/app/api/admin/login/route'
import { authenticator } from 'otplib'

function req(password: string, code: string) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json' }),
    json: async () => ({ password, code }),
  } as unknown as import('next/server').NextRequest
}

describe('admin login + TOTP', () => {
  beforeEach(() => {
    ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
    process.env.ADMIN_PASSWORD = 'correct horse battery staple'
    process.env.ADMIN_SECRET = 'x'.repeat(32)
    process.env.ADMIN_TOTP_SECRET = authenticator.generateSecret()
  })

  it('rejects a correct password with a wrong TOTP', async () => {
    expect((await POST(req('correct horse battery staple', '000000'))).status).toBe(401)
  })

  it('accepts correct password + valid TOTP', async () => {
    const code = authenticator.generate(process.env.ADMIN_TOTP_SECRET!)
    expect((await POST(req('correct horse battery staple', code))).status).toBe(200)
  })
})
