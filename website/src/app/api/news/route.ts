import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Public news feed for the launcher (and any embed on the site). Read-only,
// cacheable, fails open with an empty list rather than error noise.
export const dynamic = 'force-dynamic'

const CATEGORIES = ['update', 'event', 'donate', 'wipe'] as const

export async function GET() {
  try {
    const posts = await prisma.newsPost.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        description: true,
        body: true,
        image: true,
        category: true,
        createdAt: true,
      },
    })
    const items = posts.map((p) => ({
      ...p,
      category: (CATEGORIES as readonly string[]).includes(p.category) ? p.category : 'update',
      date: p.createdAt.toISOString(),
    }))
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json([], { headers: { 'Cache-Control': 'public, max-age=60' } })
  }
}
