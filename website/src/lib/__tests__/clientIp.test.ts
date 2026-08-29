import { describe, it, expect } from 'vitest'
import { clientIp } from '@/lib/clientIp'

function reqWith(headers: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(headers) }
}

describe('clientIp', () => {
  it('returns the single forwarded address', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5')
  })

  it('returns the first address from a comma list and trims it', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': ' 203.0.113.5 , 10.0.0.1 ' }))).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(clientIp(reqWith({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('returns "unknown" when no IP header is present', () => {
    expect(clientIp(reqWith({}))).toBe('unknown')
  })
})
