import { describe, it, expect, beforeEach, vi } from 'vitest'

// Avoid real Web Crypto session signing in the test.
vi.mock('@/lib/adminSession', () => ({
  ADMIN_SESSION_TTL_SECONDS: 60,
  createSessionToken: async () => 'fake.session.token',
}))

function adminReq(ip: string, password: string) {
  return {
    headers: new Headers({ 'x-forwarded-for': ip, 'content-type': 'application/json' }),
    json: async () => ({ password }),
  } as unknown as import('next/server').NextRequest
}

describe('admin login rate limiting', () => {
  beforeEach(() => {
    // Reset the global in-memory limiter between tests.
    ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
    process.env.ADMIN_PASSWORD = 'correct horse battery staple'
    process.env.ADMIN_SECRET = 'x'.repeat(32)
  })

  it('returns 429 after 5 failed attempts from the same IP within the window', async () => {
    const { POST } = await import('@/app/api/admin/login/route')
    const ip = '203.0.113.99'
    for (let i = 0; i < 5; i++) {
      const res = await POST(adminReq(ip, 'wrong-guess'))
      expect(res.status).toBe(401)
    }
    const blocked = await POST(adminReq(ip, 'wrong-guess'))
    expect(blocked.status).toBe(429)
  })
})
