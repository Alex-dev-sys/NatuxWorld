import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findUnique, update, updateMany, sendVerificationEmail, logLoginEvent } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  sendVerificationEmail: vi.fn(),
  logLoginEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique, update, updateMany } } }))
vi.mock('@/lib/auth', () => ({
  apiError: (code: string, message: string, status: number) => Response.json({ error: { code, message } }, { status }),
  formatUser: (user: unknown) => user,
  signToken: () => 'token',
  generateCode: () => '123456',
  codeExpiry: () => new Date(Date.now() + 60_000),
  sendVerificationEmail,
  logLoginEvent,
}))

import { POST as verifyEmail } from '@/app/api/auth/verify-email/route'
import { POST as resendCode } from '@/app/api/auth/resend-code/route'

function req(body: unknown) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  findUnique.mockReset()
  update.mockReset()
  updateMany.mockReset()
  sendVerificationEmail.mockReset().mockResolvedValue(undefined)
  logLoginEvent.mockReset()
  ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
})

describe('email verification security', () => {
  it('does not verify an already verified account or issue a session', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'user@example.com', emailVerified: true, verifyCode: '123456', verifyCodeExpires: new Date(Date.now() + 60_000), tokenVersion: 0 })
    const res = await verifyEmail(req({ email: 'user@example.com', code: '123456' }))
    expect(res.status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('does not generate a resend code for an already verified account', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'user@example.com', emailVerified: true })
    const res = await resendCode(req({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    expect(update).not.toHaveBeenCalled()
    expect(sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('consumes a valid code with a conditional update', async () => {
    const user = { id: 'u1', email: 'user@example.com', emailVerified: false, verifyCode: '123456', verifyCodeExpires: new Date(Date.now() + 60_000), tokenVersion: 0 }
    findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, emailVerified: true, verifyCode: null })
    updateMany.mockResolvedValue({ count: 1 })
    const res = await verifyEmail(req({ email: user.email, code: '123456' }))
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledOnce()
  })
})
