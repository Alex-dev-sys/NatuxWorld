import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rateLimit } from '@/lib/ratelimit'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to the limit within the window and blocks beyond it', () => {
    const key = 'test-limit:ip1'
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(false)
  })

  it('allows again after the window has passed', () => {
    const key = 'test-window:ip1'
    expect(rateLimit(key, 1, 60_000)).toBe(true)
    expect(rateLimit(key, 1, 60_000)).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
    expect(rateLimit(key, 1, 60_000)).toBe(true)
  })

  it('tracks independent keys separately', () => {
    expect(rateLimit('test-keys:ip1', 1, 60_000)).toBe(true)
    expect(rateLimit('test-keys:ip1', 1, 60_000)).toBe(false)
    expect(rateLimit('test-keys:ip2', 1, 60_000)).toBe(true)
  })
})
