import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { $queryRawUnsafe: queryRaw },
}))

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  beforeEach(() => queryRaw.mockReset())

  it('reports ready only after the database responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }])

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'ok' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('does not report ready on an invalid database response', async () => {
    queryRaw.mockResolvedValue(undefined)

    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable', database: 'unavailable' })
  })
})
