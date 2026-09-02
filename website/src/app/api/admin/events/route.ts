import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Simple SSE stream that polls DB every 5s and pushes new events
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { closed = true }
      }

      // Send heartbeat immediately
      send({ type: 'connected' })

      let lastEventId: string | null = null
      let lastOrderId: string | null = null
      let lastCrashId: string | null = null

      // Seed with latest IDs to avoid replaying history
      try {
        const [le, lo, lc] = await Promise.all([
          prisma.loginEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
          prisma.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
          prisma.crashReport.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
        ])
        lastEventId = le?.id ?? null
        lastOrderId = lo?.id ?? null
        lastCrashId = lc?.id ?? null
      } catch { /* db error on init */ }

      const poll = async () => {
        if (closed) return
        try {
          // Re-check admin auth every cycle: a logged-out or revoked session
          // must stop receiving events immediately, not on next page load.
          if (!(await requireAdmin(req))) {
            closed = true
            clearInterval(interval)
            try { controller.close() } catch { /* already closed */ }
            return
          }
          const [newEvents, newOrders, newCrashes] = await Promise.all([
            lastEventId
              ? prisma.loginEvent.findMany({
                  where: { createdAt: { gt: (await prisma.loginEvent.findUnique({ where: { id: lastEventId }, select: { createdAt: true } }))?.createdAt ?? new Date(0) } },
                  orderBy: { createdAt: 'asc' }, take: 20,
                  select: { id: true, userId: true, ip: true, kind: true, createdAt: true },
                })
              : [],
            lastOrderId
              ? prisma.order.findMany({
                  where: { createdAt: { gt: (await prisma.order.findUnique({ where: { id: lastOrderId }, select: { createdAt: true } }))?.createdAt ?? new Date(0) } },
                  orderBy: { createdAt: 'asc' }, take: 10,
                  select: { id: true, publicId: true, username: true, productName: true, price: true, status: true, createdAt: true },
                })
              : [],
            lastCrashId
              ? prisma.crashReport.findMany({
                  where: { createdAt: { gt: (await prisma.crashReport.findUnique({ where: { id: lastCrashId }, select: { createdAt: true } }))?.createdAt ?? new Date(0) } },
                  orderBy: { createdAt: 'asc' }, take: 10,
                  select: { id: true, kind: true, stage: true, message: true, createdAt: true },
                })
              : [],
          ])

          for (const e of newEvents) {
            send({ type: 'login_event', data: e })
            lastEventId = e.id
          }
          for (const o of newOrders) {
            send({ type: 'order', data: o })
            lastOrderId = o.id
          }
          for (const c of newCrashes) {
            send({ type: 'crash', data: c })
            lastCrashId = c.id
          }

          send({ type: 'ping' })
        } catch { /* ignore poll errors */ }
      }

      const interval = setInterval(poll, 5000)

      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
