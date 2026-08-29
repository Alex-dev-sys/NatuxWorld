import { describe, it, expect } from 'vitest'
import { buildCommands } from '@/lib/rcon'

const baseVars = {
  username: 'Steve_123',
  rank: 'vip',
  duration: '30 дней',
  durationDays: '30',
  orderId: 'ord_42',
  price: 299,
}

describe('buildCommands', () => {
  it('substitutes all placeholders', () => {
    const templates = [
      'lp user {username} parent addtemp {rank} {duration_days}d',
      'broadcast {username} bought {rank} for {duration} ({price}₽, order {order_id})',
    ]
    expect(buildCommands(templates, baseVars)).toEqual([
      'lp user Steve_123 parent addtemp vip 30d',
      'broadcast Steve_123 bought vip for 30 дней (299₽, order ord_42)',
    ])
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    const templates = ['say {username} {username} {rank} {rank}']
    expect(buildCommands(templates, baseVars)).toEqual([
      'say Steve_123 Steve_123 vip vip',
    ])
  })

  it('throws on a username that is too short', () => {
    expect(() => buildCommands(['say {username}'], { ...baseVars, username: 'ab' })).toThrow(
      /Unsafe username/
    )
  })

  it('throws on a username containing injection characters', () => {
    expect(() =>
      buildCommands(['say {username}'], { ...baseVars, username: 'hacker;stop' })
    ).toThrow(/Unsafe username/)
  })

  it('throws on a username that is too long', () => {
    expect(() =>
      buildCommands(['say {username}'], { ...baseVars, username: 'a'.repeat(17) })
    ).toThrow(/Unsafe username/)
  })

  it('throws on a rank containing unsafe characters', () => {
    expect(() => buildCommands(['say {rank}'], { ...baseVars, rank: 'vip;op' })).toThrow(
      /Unsafe rank/
    )
  })
})
