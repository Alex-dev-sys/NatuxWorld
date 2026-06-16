import { describe, it, expect } from 'vitest'
import { classifyRcon } from '@/lib/rconPolicy'

describe('classifyRcon', () => {
  it('classifies safe read/benign commands', () => {
    for (const c of ['list', 'tps', 'spark tps', 'version', 'time query daytime', 'say hi', 'whitelist list'])
      expect(classifyRcon(c)).toBe('safe')
  })
  it('classifies state-changing commands as confirm', () => {
    for (const c of ['op steve', 'deop steve', 'kick steve', 'give steve dirt 1', 'gamemode creative steve', 'mute steve', 'whitelist add steve'])
      expect(classifyRcon(c)).toBe('confirm')
  })
  it('classifies lifecycle commands as server', () => {
    for (const c of ['stop', 'restart', 'save-all', 'save-off'])
      expect(classifyRcon(c)).toBe('server')
  })
  it('tolerates a leading slash', () => {
    expect(classifyRcon('/op steve')).toBe('confirm')
    expect(classifyRcon('/stop')).toBe('server')
  })
  it('classifies execute as confirm (it can wrap others)', () => {
    expect(classifyRcon('execute run stop')).toBe('confirm')
  })
  it('defaults unknown commands to confirm (fail safe)', () => {
    expect(classifyRcon('somerandomplugincmd foo')).toBe('confirm')
  })
})
