import { NextRequest } from 'next/server'
import { clientIp } from '@/lib/clientIp'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { generateCode, codeExpiry, sendVerificationEmail, apiError } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`resend-ip:${ip}`, 5, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  let body: unknown
  try { body = await req.json() } catch { return Response.json({ status: 'verification_sent' }) }
  const email = typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : ''
  if (!email) return Response.json({ status: 'verification_sent' })

  if (!rateLimit(`resend:${ip}:${email}`, 3, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  // Keep this endpoint enumeration-resistant. A verified account must not get
  // a code that can be exchanged for a passwordless session.
  if (!user || user.emailVerified) return Response.json({ status: 'verification_sent' })

  const code = generateCode()
  await prisma.user.update({
    where: { email },
    data: { verifyCode: code, verifyCodeExpires: codeExpiry() },
  })

  try {
    await sendVerificationEmail(email, code)
  } catch (err) {
    console.error('Email send failed:', err)
  }

  return Response.json({ status: 'verification_sent' })
}
