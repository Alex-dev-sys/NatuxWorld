import { randomInt } from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'

export type UserPublic = { id: string; username: string; email: string }

export function formatUser(u: { id: string; username: string; email: string }): UserPublic {
  return { id: u.id, username: u.username, email: u.email }
}

export function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ sub: userId }, secret, { expiresIn: '30d' })
}

export function verifyToken(token: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  const payload = jwt.verify(token, secret) as { sub: string }
  return payload.sub
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
  kind: 'login' | 'verify' | 'register' | 'fail'
}): Promise<void> {
  const { prisma } = await import('@/lib/db')
  await prisma.loginEvent.create({ data: opts }).catch(() => {})
}
