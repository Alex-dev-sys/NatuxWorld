import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { products } from '@/lib/products'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

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

  const [orders, logins, tokens, gameEvents] = await Promise.all([
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
  ])

  return NextResponse.json({
    ...user,
    orders,
    logins,
    tokens: tokens.map(t => ({
      accessToken: t.accessToken.slice(0, 8) + '…',
      hasServerId: !!t.serverId,
      createdAt: t.createdAt,
    })),
    gameEvents,
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { action, banReason, productId, duration } = body as {
    action: string; banReason?: string; productId?: string; duration?: string
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'ban') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { bannedAt: new Date(), banReason: banReason ?? 'Заблокирован администратором', tokenVersion: { increment: 1 } },
    })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'unban') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { bannedAt: null, banReason: null },
    })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'revoke-tokens') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { tokenVersion: { increment: 1 } },
    })
    await prisma.gameToken.deleteMany({ where: { userId: params.id } })
    return NextResponse.json({ ok: true, tokenVersion: updated.tokenVersion })
  }

  if (action === 'force-verify') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { emailVerified: true, verifyCode: null, verifyCodeExpires: null },
    })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'force-unverify') {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { emailVerified: false },
    })
    return NextResponse.json({ ok: true, user: updated })
  }

  if (action === 'give-rank') {
    if (!productId || !duration) return NextResponse.json({ error: 'productId и duration обязательны' }, { status: 400 })
    const product = products.find(p => p.id === productId)
    if (!product) return NextResponse.json({ error: 'Продукт не найден' }, { status: 404 })
    const variant = product.variants.find(v => v.duration === duration)
    if (!variant) return NextResponse.json({ error: 'Вариант не найден' }, { status: 404 })

    const commands = variant.commands.map(cmd =>
      cmd.replace(/{username}/g, user.username).replace(/{rank}/g, product.slug)
        .replace(/{duration}/g, duration).replace(/{duration_days}/g, duration.replace('d',''))
        .replace(/{order_id}/g, 'admin').replace(/{price}/g, String(variant.price))
    )

    const result = await executeRcon(commands)
    return NextResponse.json({ ok: result.success, commands, error: result.error })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
