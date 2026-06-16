import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const findMany = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import { GET } from '@/app/api/admin/audit/route'

function req(url = 'http://x/api/admin/audit') {
  return { headers: new Headers(), url, nextUrl: new URL(url) } as unknown as import('next/server').NextRequest
}

describe('admin audit route', () => {
  beforeEach(() => { findMany.mockReset(); findMany.mockResolvedValue([{ id: '1', action: 'rcon.exec' }]) })

  it('returns recent rows newest-first', async () => {
    const res = await GET(req())
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 100 }))
  })

  it('filters by action prefix when provided', async () => {
    await GET(req('http://x/api/admin/audit?action=player'))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: { startsWith: 'player' } },
    }))
  })
})
