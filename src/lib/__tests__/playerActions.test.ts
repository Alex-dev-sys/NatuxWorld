import { describe, it, expect } from 'vitest'
import { buildPlayerCommand, PLAYER_ACTIONS } from '@/lib/playerActions'

describe('buildPlayerCommand', () => {
  it('builds simple single-arg actions', () => {
    expect(buildPlayerCommand('heal', { username: 'steve' })).toBe('heal steve')
    expect(buildPlayerCommand('kill', { username: 'steve' })).toBe('kill steve')
  })
  it('builds kick with a sanitized reason', () => {
    expect(buildPlayerCommand('kick', { username: 'steve', reason: 'griefing' })).toBe('kick steve griefing')
  })
  it('builds give with item + amount', () => {
    expect(buildPlayerCommand('give', { username: 'steve', item: 'minecraft:dirt', amount: 64 })).toBe('give steve minecraft:dirt 64')
  })
  it('builds gamemode with a valid mode', () => {
    expect(buildPlayerCommand('gamemode', { username: 'steve', mode: 'creative' })).toBe('gamemode creative steve')
  })
  it('builds tp_coords from numbers', () => {
    expect(buildPlayerCommand('tp_coords', { username: 'steve', x: 10, y: 64, z: -5 })).toBe('tp steve 10 64 -5')
  })
  it('rejects an unsafe username', () => {
    expect(() => buildPlayerCommand('heal', { username: 'st;eve' })).toThrow()
  })
  it('rejects an invalid gamemode', () => {
    expect(() => buildPlayerCommand('gamemode', { username: 'steve', mode: 'wizard' })).toThrow()
  })
  it('rejects a bad item id', () => {
    expect(() => buildPlayerCommand('give', { username: 'steve', item: 'dirt; stop', amount: 1 })).toThrow()
  })
  it('rejects an out-of-range amount', () => {
    expect(() => buildPlayerCommand('give', { username: 'steve', item: 'minecraft:dirt', amount: 99999 })).toThrow()
  })
  it('rejects a reason containing a newline', () => {
    expect(() => buildPlayerCommand('kick', { username: 'steve', reason: 'a\nstop' })).toThrow()
  })
  it('exposes the action list with broadcast as the only safe-tier entry', () => {
    expect(PLAYER_ACTIONS.broadcast.tier).toBe('safe')
    expect(PLAYER_ACTIONS.kick.tier).toBe('confirm')
  })
})
