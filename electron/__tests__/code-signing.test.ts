import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { checkCodeSigning } = require('../../scripts/check-code-signing.cjs')
const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config')
const { DebugLogger } = require('builder-util')
const windowsEnv = { WIN_CSC_LINK: 'test-certificate', WIN_CSC_KEY_PASSWORD: 'test-password' }
const macEnv = {
  CSC_LINK: 'test-certificate', CSC_KEY_PASSWORD: 'test-password',
  MAC_SIGNING_IDENTITY: 'Example Company (TEAMID)', APPLE_ID: 'test@example.invalid',
  APPLE_APP_SPECIFIC_PASSWORD: 'test-app-password', APPLE_TEAM_ID: 'TEAMID',
}

afterEach(() => vi.unstubAllEnvs())

describe('signing preflight', () => {
  it('requires only the selected platform credentials', () => {
    expect(() => checkCodeSigning('win', windowsEnv)).not.toThrow()
    expect(() => checkCodeSigning('mac', macEnv)).not.toThrow()
    expect(() => checkCodeSigning('linux', {})).toThrow('win or mac')
  })

  it('rejects every missing or blank credential without printing values', () => {
    for (const [platform, env] of [['win', windowsEnv], ['mac', macEnv]] as const) {
      for (const name of Object.keys(env)) {
        expect(() => checkCodeSigning(platform, { ...env, [name]: '  ' })).toThrow(name)
      }
    }
    expect(() => checkCodeSigning('mac', { ...macEnv, MAC_SIGNING_IDENTITY: '-' })).toThrow('ad-hoc')
  })

  it('fails the CLI before building and emits names only', () => {
    const result = spawnSync(process.execPath, ['scripts/check-code-signing.cjs', '--platform', 'win'], {
      cwd: resolve(__dirname, '../..'), encoding: 'utf8',
      env: { ...process.env, WIN_CSC_LINK: 'sensitive-certificate-value', WIN_CSC_KEY_PASSWORD: '' },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('WIN_CSC_KEY_PASSWORD')
    expect(result.stderr).not.toContain('sensitive-certificate-value')
  })

  it('rejects malformed CLI arguments', () => {
    const result = spawnSync(process.execPath, ['scripts/check-code-signing.cjs', '--platform', 'win', 'extra'], {
      cwd: resolve(__dirname, '../..'), encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage:')
  })
})

describe('signed release profile with installed electron-builder', () => {
  it('merges the base config, resolves identity and passes the installed schema', async () => {
    vi.stubEnv('MAC_SIGNING_IDENTITY', macEnv.MAC_SIGNING_IDENTITY)
    const config = await getConfig(resolve(__dirname, '../..'), 'config/electron-builder.signed.cjs')
    await validateConfiguration(config, new DebugLogger())
    expect(config.forceCodeSigning).toBe(true)
    expect(config.win.signAndEditExecutable).toBe(true)
    expect(config.mac).toMatchObject({
      identity: macEnv.MAC_SIGNING_IDENTITY, type: 'distribution', hardenedRuntime: true, notarize: true,
    })
    expect(config.afterPack).toBe('scripts/apply-fuses.cjs')
    expect(config.win.target).toHaveLength(2)
    expect(config.appId).toBe('world.natux.launcher')
  })

  it('checks the actual build target before packing, including direct builder invocations', async () => {
    vi.stubEnv('WIN_CSC_LINK', windowsEnv.WIN_CSC_LINK)
    vi.stubEnv('WIN_CSC_KEY_PASSWORD', windowsEnv.WIN_CSC_KEY_PASSWORD)
    vi.stubEnv('APPLE_TEAM_ID', '')
    const config = await getConfig(resolve(__dirname, '../..'), 'config/electron-builder.signed.cjs')
    expect(() => config.beforePack({ electronPlatformName: 'win32' })).not.toThrow()
    expect(() => config.beforePack({ electronPlatformName: 'darwin' })).toThrow('APPLE_TEAM_ID')
    expect(() => config.beforePack({ electronPlatformName: 'linux' })).toThrow('Windows and macOS only')
  })
})
