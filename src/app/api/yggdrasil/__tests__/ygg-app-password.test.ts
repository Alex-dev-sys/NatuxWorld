import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const apFindMany = vi.fn()
const apUpdateMany = vi.fn()
const gtCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
    appPassword: { findMany: (...a: unknown[]) => apFindMany(...a), updateMany: (...a: unknown[]) => apUpdateMany(...a) },
    gameToken: { create: (...a: unknown[]) => gtCreate(...a) },
  },
}))
vi.mock('@/lib/lockout', () => ({ isLockedOut: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/auth', () => ({ logLoginEvent: vi.fn() }))

import { POST } from '@/app/api/yggdrasil/authserver/authenticate/route'
import bcrypt from 'bcryptjs'
import { generateAppPassword, hashAppPassword } from '@/lib/appPassword'

function req(username: string, password: string) {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.8' }), json: async () => ({ username, password }) } as unknown as import('next/server').NextRequest
}

describe('yggdrasil + 2FA app-password', () => {
  beforeEach(() => {
    ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
    findUnique.mockReset(); apFindMany.mockReset(); apUpdateMany.mockResolvedValue({}); gtCreate.mockResolvedValue({})
  })

  it('accepts a valid app-password and rejects the main password for a 2FA user', async () => {
    const app = generateAppPassword()
    findUnique.mockResolvedValue({ id: 'u_1', username: 'u', emailVerified: true, twoFactorEnabled: true, passwordHash: await bcrypt.hash('MAIN-password', 10) })
    apFindMany.mockResolvedValue([{ hash: await hashAppPassword(app) }])
    expect((await POST(req('u', app))).status).toBe(200)

    apFindMany.mockResolvedValue([{ hash: await hashAppPassword(app) }])
    expect((await POST(req('u', 'MAIN-password'))).status).toBe(403)
  })

  it('non-2FA user still uses the main password', async () => {
    findUnique.mockResolvedValue({ id: 'u_2', username: 'v', emailVerified: true, twoFactorEnabled: false, passwordHash: await bcrypt.hash('mainpw', 10) })
    expect((await POST(req('v', 'mainpw'))).status).toBe(200)
  })
})
