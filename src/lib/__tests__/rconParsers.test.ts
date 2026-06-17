import { describe, it, expect } from 'vitest'
import { parsePlayers, parseTps, parseWhitelist, stripColorCodes } from '@/lib/rconParsers'

describe('stripColorCodes', () => {
  it('removes section-sign codes', () => {
    expect(stripColorCodes('§aHello §6World')).toBe('Hello World')
  })
})

describe('parsePlayers', () => {
  it('parses online players with max-of phrasing', () => {
    const r = parsePlayers('There are 2 of a max of 20 players online: steve, alex')
    expect(r).toEqual({ online: 2, max: 20, players: ['steve', 'alex'] })
  })
  it('parses the short phrasing', () => {
    const r = parsePlayers('There are 1 of 40 players online: bob')
    expect(r).toEqual({ online: 1, max: 40, players: ['bob'] })
  })
  it('handles an empty server', () => {
    const r = parsePlayers('There are 0 of 20 players online:')
    expect(r).toEqual({ online: 0, max: 20, players: [] })
  })
  it('returns zeros on unparseable input', () => {
    expect(parsePlayers('garbage')).toEqual({ online: 0, max: 0, players: [] })
  })
})

describe('parseTps', () => {
  it('parses three averages', () => {
    expect(parseTps('TPS from last 1m, 5m, 15m: 20.0, 19.8, 19.5')).toEqual([20.0, 19.8, 19.5])
  })
  it('ignores asterisk capped markers and color codes', () => {
    expect(parseTps('§6TPS from last 1m, 5m, 15m: §a*20.0, §a19.0, §c5.0')).toEqual([20.0, 19.0, 5.0])
  })
  it('returns empty on garbage', () => {
    expect(parseTps('no tps here')).toEqual([])
  })
})

describe('parseWhitelist', () => {
  it('parses a populated whitelist', () => {
    expect(parseWhitelist('There are 3 whitelisted player(s): a, b, c')).toEqual(['a', 'b', 'c'])
  })
  it('parses the non-paren phrasing', () => {
    expect(parseWhitelist('There are 2 whitelisted players: steve, alex')).toEqual(['steve', 'alex'])
  })
  it('returns empty for an empty whitelist', () => {
    expect(parseWhitelist('There are no whitelisted players')).toEqual([])
  })
})
