import { randomInt } from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'

export type UserPublic = { id: string; username: string; email: string }

export function formatUser(u: { id: string; username: string; email: string }): UserPublic {
  return { id: u.id, username: u.username, email: u.email }
}

export function signToken(userId: string, tokenVersion: number = 0): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ sub: userId, tv: tokenVersion }, secret, { expiresIn: '30d' })
}

export function verifyToken(token: string): { sub: string; tv: number } {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  const payload = jwt.verify(token, secret) as { sub?: string; tv?: number; purpose?: string }
  // Session tokens carry exactly sub + numeric tv. Reject purpose-bound tokens
  // (e.g. the 5-minute 2FA challenge) and tokens without a tokenVersion, so a
  // short-lived challenge can never be replayed as a bearer session.
  if (typeof payload.sub !== 'string' || typeof payload.tv !== 'number' || payload.purpose) {
    throw new Error('Invalid token claims')
  }
  return { sub: payload.sub, tv: payload.tv }
}

// Extract the user id from an `Authorization: Bearer <jwt>` header, or null.
export function bearerUserId(headers: Headers): string | null {
  const h = headers.get('authorization') ?? ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return null
  try { return verifyToken(token).sub } catch { return null }
}

/**
 * Resolve a currently valid user session. Unlike bearerUserId, this enforces
 * server-side revocation and account state, so it is safe for security-sensitive
 * mutations such as 2FA and app-password management.
 */
export async function authenticatedUser(headers: Headers) {
  const h = headers.get('authorization') ?? ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return null
  let claims: { sub: string; tv: number }
  try { claims = verifyToken(token) } catch { return null }
  const { prisma } = await import('@/lib/db')
  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (
    !user ||
    user.tokenVersion !== claims.tv ||
    !user.emailVerified ||
    user.bannedAt
  ) return null
  return user
}

export function generateCode(): string {
  return String(randomInt(100000, 1000000))
}

export function codeExpiry(): Date {
  return new Date(Date.now() + 15 * 60 * 1000)
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Подтверждение аккаунта NATUX WORLD',
    text: `Ваш код подтверждения: ${code}\n\nКод действителен 15 минут.`,
    html: `<p>Ваш код подтверждения: <strong>${code}</strong></p><p>Код действителен 15 минут.</p>`,
  })
}

export function apiError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status })
}

export async function logLoginEvent(opts: {
  userId?: string
  ip: string
  userAgent: string
  kind: 'login' | 'verify' | 'register' | 'fail' | 'join'
}): Promise<void> {
  const { prisma } = await import('@/lib/db')
  await prisma.loginEvent.create({ data: opts }).catch(() => {})
  // Opportunistic retention: ~1% of writes trims records older than 180 days so
  // the table (IPs, user agents) stays bounded without a cron dependency.
  if (Math.random() < 0.01) {
    await prisma.loginEvent
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } })
      .catch(() => {})
  }
}
