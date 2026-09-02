import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'
import { buildCommands, executeRcon } from '@/lib/rcon'
import { getProductById } from '@/lib/productStore'
import { logAdminAction } from '@/lib/adminAudit'
import { offlineUuid } from '@/lib/yggdrasil'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/

// 12-char temp password (admin relays it to the user out of band).
function genTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12))
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, username: true, email: true,
      emailVerified: true, tokenVersion: true,
      bannedAt: true, banReason: true, createdAt: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [orders, logins, tokens, gameEvents, gameEventsAndIps] = await Promise.all([
    prisma.order.findMany({
      where: { username: user.username },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, publicId: true, productName: true, variantDurationLabel: true,
        price: true, status: true, createdAt: true, deliveredAt: true, couponCode: true,
      },
    }),
    prisma.loginEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, kind: true, ip: true, userAgent: true, createdAt: true },
    }),
    prisma.gameToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { accessToken: true, serverId: true, createdAt: true },
    }),
    prisma.gameEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.loginEvent.groupBy({
      by: ['ip'],
      where: { userId: user.id },
      _count: { ip: true },
      _max: { createdAt: true },
    }),
  ])

  const ipHistory = (gameEventsAndIps as { ip: string; _count: { ip: number }; _max: { createdAt: Date | null } }[])
    .map(r => ({ ip: r.ip, count: r._count.ip, lastSeen: r._max.createdAt }))
    .sort((a, b) => (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0))

  return NextResponse.json({
    ...user,
    orders,
    logins,
    tokens: tokens.map((t: { accessToken: string; serverId: string | null; createdAt: Date }) => ({
      accessToken: t.accessToken.slice(0, 8) + '…',
      hasServerId: !!t.serverId,
      createdAt: t.createdAt,
    })),
    gameEvents,
    ipHistory,
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { action, banReason, productId, duration, email, username } = body as {
    action: string; banReason?: string; productId?: string; duration?: string
    email?: string; username?: string
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'ban') {
    const updated = await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { bannedAt: new Date(), banReason: banReason ?? 'Заблокирован администратором', tokenVersion: { increment: 1 } },
      }),
      // Ban is a hard kill: game credentials must not outlive it.
      prisma.gameToken.deleteMany({ where: { userId: params.id } }),
      prisma.appPassword.deleteMany({ where: { userId: params.id } }),
    ])
    await logAdminAction(req, 'user.ban', { target: user.username, params: { banReason }, ok: true })
    return NextResponse.json({ ok: true, user: updated[0] })
  }

  if (action === 'unban') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { bannedAt: null, banReason: null },
    })
    await logAdminAction(req, 'user.unban', { target: user.username, ok: true })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'revoke-tokens') {
    const updated = await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { tokenVersion: { increment: 1 } },
      }),
      prisma.gameToken.deleteMany({ where: { userId: params.id } }),
      // Game passwords are tokens too — a "revoke all" must kill them as well.
      prisma.appPassword.deleteMany({ where: { userId: params.id } }),
    ])
    await logAdminAction(req, 'user.revoke-tokens', { target: user.username, ok: true })
    return NextResponse.json({ ok: true, tokenVersion: (updated[0] as { tokenVersion: number }).tokenVersion })
  }

  if (action === 'force-verify') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { emailVerified: true, verifyCode: null, verifyCodeExpires: null },
    })
    await logAdminAction(req, 'user.force-verify', { target: user.username, ok: true })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'force-unverify') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { emailVerified: false },
    })
    await logAdminAction(req, 'user.force-unverify', { target: user.username, ok: true })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'set-email') {
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Некорректный email' }, { status: 400 })
    const clash = await prisma.user.findUnique({ where: { email } })
    if (clash && clash.id !== params.id) return NextResponse.json({ error: 'Email уже занят' }, { status: 409 })
    // New email must be re-verified; bump tokenVersion to drop existing sessions.
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { email, emailVerified: false, verifyCode: null, verifyCodeExpires: null, tokenVersion: { increment: 1 } },
    })
    await logAdminAction(req, 'user.set-email', { target: user.username, params: { email }, ok: true })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'set-username') {
    if (!username || !USERNAME_RE.test(username)) return NextResponse.json({ error: 'Ник 3-16 символов: A-Z a-z 0-9 _' }, { status: 400 })
    const clash = await prisma.user.findUnique({ where: { username } })
    if (clash && clash.id !== params.id) return NextResponse.json({ error: 'Ник уже занят' }, { status: 409 })
    // username is the in-game / yggdrasil identity. Orders reference it by value,
    // so migrate the old order rows to the new name to keep the user's history.
    // The precomputed offline uuid is derived from the username — keep it in sync.
    await prisma.$transaction([
      prisma.user.update({ where: { id: params.id }, data: { username, uuid: offlineUuid(username) } }),
      prisma.order.updateMany({ where: { username: user.username }, data: { username } }),
      prisma.gameEvent.updateMany({ where: { username: user.username }, data: { username } }),
    ])
    await logAdminAction(req, 'user.set-username', { target: user.username, params: { from: user.username, to: username }, ok: true })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset-password') {
    const tempPassword = genTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)
    await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { passwordHash, tokenVersion: { increment: 1 } }, // bump = logout everywhere
      }),
      prisma.gameToken.deleteMany({ where: { userId: params.id } }),
      // A hard credential reset must also kill game passwords, otherwise a
      // stolen app-password keeps working after the "reset".
      prisma.appPassword.deleteMany({ where: { userId: params.id } }),
    ])
    // Never log the password itself.
    await logAdminAction(req, 'user.reset-password', { target: user.username, ok: true })
    return NextResponse.json({ ok: true, tempPassword })
  }

  if (action === 'reset-2fa') {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { twoFactorEnabled: false, twoFactorMethod: null, totpSecretEnc: null, twoFactorCode: null, twoFactorCodeExpires: null, tokenVersion: { increment: 1 } },
      }),
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: params.id } }),
      prisma.gameToken.deleteMany({ where: { userId: params.id } }),
      // Game passwords were issued under the old 2FA enrollment — revoke them
      // together with the factor they were created against.
      prisma.appPassword.deleteMany({ where: { userId: params.id } }),
    ])
    await logAdminAction(req, 'user.reset-2fa', { target: user.username, ok: true })
    return NextResponse.json({ ok: true })
  }

  if (action === 'give-rank') {
    if (!productId || !duration) return NextResponse.json({ error: 'productId и duration обязательны' }, { status: 400 })
    const product = await getProductById(productId)
    if (!product) return NextResponse.json({ error: 'Продукт не найден' }, { status: 404 })
    const variant = product.variants.find(v => v.duration === duration)
    if (!variant) return NextResponse.json({ error: 'Вариант не найден' }, { status: 404 })

    // Route through buildCommands so the username/rank are validated against the
    // SAFE_USERNAME / SAFE_ALPHANUMERIC guards before hitting RCON — same boundary
    // the order-delivery path uses. Never interpolate raw user input into commands.
    let commands: string[]
    try {
      commands = buildCommands(variant.commands, {
        username: user.username,
        rank: product.slug,
        duration,
        durationDays: duration.replace('d', ''),
        orderId: 'admin',
        price: variant.price,
      })
    } catch {
      return NextResponse.json({ error: 'Недопустимый ник или ранг для RCON' }, { status: 400 })
    }

    const result = await executeRcon(commands)
    await logAdminAction(req, 'user.give-rank', { target: user.username, params: { productId, duration }, ok: result.success })
    return NextResponse.json({ ok: result.success, commands, error: result.error })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
