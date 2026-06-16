# Admin Panel Expansion — Phase 0+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin audit log, tiered RCON safety, and player game-control actions (kick/mute/heal/give/tp/etc.) to the NATUX admin panel.

**Architecture:** Phase 0 adds an immutable `AdminAudit` table written by a never-throwing helper, plus a command classifier that replaces the blunt RCON regex-block with safe/confirm/server tiers. Phase 1 captures RCON response text, adds a validated `playerActions` command-builder layer (EssentialsX/vanilla), a `/api/admin/player` route, an `/api/admin/online` roster route, and UI wiring.

**Tech Stack:** Next.js 14 (app router), Prisma 7 / Postgres, `rcon-client`, vitest, Tailwind. Server plugins: LuckPerms, EssentialsX 2.21.

---

## File Structure

- Create: `src/lib/adminAudit.ts` — audit helper (`logAdminAction`).
- Create: `src/lib/rconPolicy.ts` — `classifyRcon` tier classifier.
- Create: `src/lib/playerActions.ts` — validated player command builder.
- Create: `src/app/api/admin/player/route.ts` — player action endpoint.
- Create: `src/app/api/admin/online/route.ts` — online roster endpoint.
- Create: `src/app/api/admin/audit/route.ts` — audit list endpoint.
- Modify: `prisma/schema.prisma` — add `AdminAudit` model.
- Modify: `src/lib/rcon.ts` — return per-command responses (additive).
- Modify: `src/app/api/admin/rcon/route.ts` — tiers + confirm + audit.
- Modify: `src/app/admin/page.tsx` — Audit tab, RCON confirm UI, player action bar, Online tab.
- Tests: colocated in `src/lib/__tests__/` and `src/app/api/admin/__tests__/` (follow existing `admin-totp.test.ts` style).

**Conventions** (match existing code):
- Auth gate: `if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })`.
- Client IP: `clientIp(req)` from `@/lib/clientIp`.
- DB: `prisma` from `@/lib/db`.
- Routes export `const dynamic = 'force-dynamic'`.
- RCON mock in tests: set `process.env.RCON_MOCK = 'true'`.

---

## Task 1: AdminAudit model + migration

**Files:**
- Modify: `prisma/schema.prisma` (append new model after `Order`)

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma`:

```prisma
model AdminAudit {
  id        String   @id @default(cuid())
  action    String
  target    String?
  params    Json
  ip        String
  ok        Boolean
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([action])
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name admin_audit`
Expected: a new folder under `prisma/migrations/` and "Your database is now in sync with your schema."

- [ ] **Step 3: Verify Prisma client regenerated**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — `prisma.adminAudit` is now available.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(admin): add AdminAudit table"
```

---

## Task 2: adminAudit helper

**Files:**
- Create: `src/lib/adminAudit.ts`
- Test: `src/lib/__tests__/adminAudit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const create = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => create(...a) } } }))

import { logAdminAction } from '@/lib/adminAudit'

function req(ip = '203.0.113.5') {
  return { headers: new Headers({ 'x-forwarded-for': ip }) } as unknown as import('next/server').NextRequest
}

describe('logAdminAction', () => {
  beforeEach(() => { create.mockReset() })

  it('writes a row with action, target, params, ip, ok', async () => {
    await logAdminAction(req(), 'user.ban', { target: 'steve', params: { reason: 'x' }, ok: true })
    expect(create).toHaveBeenCalledWith({
      data: { action: 'user.ban', target: 'steve', params: { reason: 'x' }, ip: '203.0.113.5', ok: true },
    })
  })

  it('never throws when the DB write fails', async () => {
    create.mockRejectedValueOnce(new Error('db down'))
    await expect(logAdminAction(req(), 'rcon.exec', { ok: false })).resolves.toBeUndefined()
  })

  it('defaults target to null and params to empty object', async () => {
    await logAdminAction(req(), 'order.retry', { ok: true })
    expect(create).toHaveBeenCalledWith({
      data: { action: 'order.retry', target: null, params: {}, ip: '203.0.113.5', ok: true },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/adminAudit.test.ts`
Expected: FAIL — cannot find module `@/lib/adminAudit`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/adminAudit.ts`:

```ts
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { clientIp } from '@/lib/clientIp'

interface AuditInput {
  target?: string
  params?: Record<string, unknown>
  ok: boolean
}

// Best-effort audit. Never throws into the caller — a logging failure must not
// break the action being logged.
export async function logAdminAction(
  req: NextRequest,
  action: string,
  input: AuditInput,
): Promise<void> {
  try {
    await prisma.adminAudit.create({
      data: {
        action,
        target: input.target ?? null,
        params: (input.params ?? {}) as object,
        ip: clientIp(req),
        ok: input.ok,
      },
    })
  } catch (err) {
    console.error('[adminAudit] failed to log', action, err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/adminAudit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminAudit.ts src/lib/__tests__/adminAudit.test.ts
git commit -m "feat(admin): add logAdminAction audit helper"
```

---

## Task 3: rconPolicy classifier

**Files:**
- Create: `src/lib/rconPolicy.ts`
- Test: `src/lib/__tests__/rconPolicy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/rconPolicy.test.ts`
Expected: FAIL — cannot find module `@/lib/rconPolicy`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/rconPolicy.ts`:

```ts
export type RconTier = 'safe' | 'confirm' | 'server'

// Lifecycle commands that affect server availability.
const SERVER = /^(stop|restart|save-all|save-off|save-on)\b/
// Read-only or harmless broadcast commands that need no confirmation.
const SAFE = /^(list|tps|spark|version|seed|time\s+query|say|tell|msg|weather|whitelist\s+list|mcmmo)\b/

// Returns the tier for a raw RCON command. Unknown commands default to `confirm`
// (fail safe) rather than being silently blocked — the route is already behind
// admin auth + IP allowlist, so the confirm step is the real guardrail.
export function classifyRcon(command: string): RconTier {
  const c = command.trim().replace(/^\//, '').toLowerCase()
  if (SERVER.test(c)) return 'server'
  if (SAFE.test(c)) return 'safe'
  return 'confirm'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/rconPolicy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rconPolicy.ts src/lib/__tests__/rconPolicy.test.ts
git commit -m "feat(admin): add tiered RCON command classifier"
```

---

## Task 4: RCON response capture (rcon.ts refactor)

**Files:**
- Modify: `src/lib/rcon.ts`
- Test: `src/lib/__tests__/rcon-responses.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { executeRcon } from '@/lib/rcon'

describe('executeRcon responses (mock mode)', () => {
  beforeEach(() => { process.env.RCON_MOCK = 'true'; delete process.env.RCON_MOCK_FAIL })

  it('returns a responses array aligned to commands', async () => {
    const r = await executeRcon(['say hi'])
    expect(r.success).toBe(true)
    expect(Array.isArray(r.responses)).toBe(true)
    expect(r.responses).toHaveLength(1)
  })

  it('returns a parseable roster for `list`', async () => {
    const r = await executeRcon(['list'])
    expect(r.responses?.[0]).toMatch(/players online/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/rcon-responses.test.ts`
Expected: FAIL — `r.responses` is undefined.

- [ ] **Step 3: Implement the refactor**

In `src/lib/rcon.ts`, add `responses` to the interface:

```ts
export interface RconResult {
  success: boolean
  commands: string[]
  responses?: string[]
  error?: string
}
```

In `tryRcon`, the mock branch must return synthetic responses (special-case `list`):

```ts
  if (process.env.PAYMENT_PROVIDER === 'mock' || process.env.RCON_MOCK === 'true') {
    console.log('[MOCK RCON] Commands:', commands)
    if (process.env.RCON_MOCK_FAIL === 'true') {
      return { success: false, commands, error: 'Connection refused (mock fail mode)' }
    }
    await new Promise(r => setTimeout(r, 200))
    const responses = commands.map(c =>
      /^\/?list\b/i.test(c.trim())
        ? 'There are 2 of 20 players online: steve, alex'
        : 'OK',
    )
    return { success: true, commands, responses }
  }
```

In the live branch, collect responses:

```ts
  await rcon.connect()
  try {
    const responses: string[] = []
    for (const cmd of commands) {
      const response = await rcon.send(cmd)
      console.log(`[RCON] ${cmd} → ${response}`)
      responses.push(response)
    }
    return { success: true, commands, responses }
  } finally {
    await rcon.end()
  }
```

- [ ] **Step 4: Run tests (new + existing) to verify pass**

Run: `npx vitest run src/lib/__tests__/rcon-responses.test.ts`
Expected: PASS (2 tests).
Run: `npx vitest run`
Expected: all existing suites still PASS (change is additive).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rcon.ts src/lib/__tests__/rcon-responses.test.ts
git commit -m "feat(admin): capture RCON response text in RconResult"
```

---

## Task 5: Wire tiers + audit into the RCON route

**Files:**
- Modify: `src/app/api/admin/rcon/route.ts`
- Test: `src/app/api/admin/__tests__/rcon-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { POST } from '@/app/api/admin/rcon/route'

function req(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7', 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

describe('admin rcon route', () => {
  beforeEach(() => { auditCreate.mockReset(); process.env.RCON_MOCK = 'true' })

  it('runs a safe command without confirm and audits it', async () => {
    const res = await POST(req({ command: 'list' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(auditCreate).toHaveBeenCalledOnce()
  })

  it('requires confirm for a confirm-tier command and does NOT audit', async () => {
    const res = await POST(req({ command: 'op steve' }))
    const data = await res.json()
    expect(data.needConfirm).toBe(true)
    expect(data.tier).toBe('confirm')
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('runs a confirm-tier command when confirm=true', async () => {
    const res = await POST(req({ command: 'op steve', confirm: true }))
    const data = await res.json()
    expect(data.needConfirm).toBeUndefined()
    expect(auditCreate).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/__tests__/rcon-route.test.ts`
Expected: FAIL — current route returns 403 for `op` / no `needConfirm`.

- [ ] **Step 3: Replace the route body**

Replace `src/app/api/admin/rcon/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { classifyRcon } from '@/lib/rconPolicy'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { command, confirm } = await req.json() as { command: string; confirm?: boolean }
  const trimmed = command?.trim()
  if (!trimmed) return NextResponse.json({ error: 'Команда пустая' }, { status: 400 })

  const tier = classifyRcon(trimmed)
  if (tier !== 'safe' && !confirm) {
    return NextResponse.json({ needConfirm: true, tier, command: trimmed })
  }

  const result = await executeRcon([trimmed])
  await logAdminAction(req, 'rcon.exec', { params: { command: trimmed, tier }, ok: result.success })
  return NextResponse.json(result)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/app/api/admin/__tests__/rcon-route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/rcon/route.ts src/app/api/admin/__tests__/rcon-route.test.ts
git commit -m "feat(admin): tiered confirm + audit on RCON route"
```

---

## Task 6: playerActions command builder

**Files:**
- Create: `src/lib/playerActions.ts`
- Test: `src/lib/__tests__/playerActions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/playerActions.test.ts`
Expected: FAIL — cannot find module `@/lib/playerActions`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/playerActions.ts`:

```ts
const SAFE_USERNAME = /^[a-zA-Z0-9_]{3,16}$/
const SAFE_ITEM = /^[a-z0-9_]+(:[a-z0-9_]+)?$/
const SAFE_TEXT = /^[\p{L}\p{N} _.,!?'"-]{1,120}$/u
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const

export type PlayerActionTier = 'safe' | 'confirm'

export interface PlayerActionDef {
  tier: PlayerActionTier
  label: string
  destructive?: boolean
}

// Registry drives both validation and the UI action bar.
export const PLAYER_ACTIONS: Record<string, PlayerActionDef> = {
  kick:      { tier: 'confirm', label: 'Кик', destructive: true },
  mute:      { tier: 'confirm', label: 'Мут', destructive: true },
  unmute:    { tier: 'confirm', label: 'Размут' },
  heal:      { tier: 'confirm', label: 'Хил' },
  feed:      { tier: 'confirm', label: 'Покормить' },
  god:       { tier: 'confirm', label: 'God-режим' },
  gamemode:  { tier: 'confirm', label: 'Режим игры' },
  give:      { tier: 'confirm', label: 'Выдать предмет' },
  tp_coords: { tier: 'confirm', label: 'Телепорт' },
  bring:     { tier: 'confirm', label: 'Призвать к себе' },
  kill:      { tier: 'confirm', label: 'Убить', destructive: true },
  broadcast: { tier: 'safe',    label: 'Объявление' },
}

interface Params {
  username?: string
  target?: string
  reason?: string
  message?: string
  time?: string
  item?: string
  amount?: number
  mode?: string
  x?: number
  y?: number
  z?: number
}

function user(name: string | undefined): string {
  if (!name || !SAFE_USERNAME.test(name)) throw new Error(`Unsafe username: ${name}`)
  return name
}
function text(s: string | undefined, field: string): string {
  if (s === undefined) throw new Error(`Missing ${field}`)
  if (!SAFE_TEXT.test(s)) throw new Error(`Unsafe ${field}`)
  return s
}
function intIn(n: number | undefined, lo: number, hi: number, field: string): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) throw new Error(`Bad ${field}`)
  return n
}
function num(n: number | undefined, field: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`Bad ${field}`)
  return n
}

// Builds a validated RCON command string for a player action. Throws on any
// failed guard — never interpolates raw input that has not passed a regex check.
export function buildPlayerCommand(action: string, p: Params): string {
  switch (action) {
    case 'kick':   return `kick ${user(p.username)} ${text(p.reason ?? 'Кик администратором', 'reason')}`
    case 'mute':   return `mute ${user(p.username)} ${text(p.time ?? '10m', 'time')} ${text(p.reason ?? 'Мут администратором', 'reason')}`
    case 'unmute': return `unmute ${user(p.username)}`
    case 'heal':   return `heal ${user(p.username)}`
    case 'feed':   return `feed ${user(p.username)}`
    case 'god':    return `god ${user(p.username)}`
    case 'kill':   return `kill ${user(p.username)}`
    case 'gamemode': {
      const m = p.mode ?? ''
      if (!(GAMEMODES as readonly string[]).includes(m)) throw new Error(`Bad gamemode: ${m}`)
      return `gamemode ${m} ${user(p.username)}`
    }
    case 'give': {
      if (!p.item || !SAFE_ITEM.test(p.item)) throw new Error(`Bad item: ${p.item}`)
      return `give ${user(p.username)} ${p.item} ${intIn(p.amount, 1, 6400, 'amount')}`
    }
    case 'tp_coords':
      return `tp ${user(p.username)} ${num(p.x, 'x')} ${num(p.y, 'y')} ${num(p.z, 'z')}`
    case 'bring':
      return `tp ${user(p.target)} ${user(p.username)}`
    case 'broadcast':
      return `broadcast ${text(p.message, 'message')}`
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/playerActions.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playerActions.ts src/lib/__tests__/playerActions.test.ts
git commit -m "feat(admin): add validated player action command builder"
```

---

## Task 7: /api/admin/player route

**Files:**
- Create: `src/app/api/admin/player/route.ts`
- Test: `src/app/api/admin/__tests__/player-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { POST } from '@/app/api/admin/player/route'

function req(body: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.8' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

describe('admin player route', () => {
  beforeEach(() => { auditCreate.mockReset(); process.env.RCON_MOCK = 'true' })

  it('gates a confirm-tier action behind confirm', async () => {
    const res = await POST(req({ action: 'kick', username: 'steve', reason: 'x' }))
    const data = await res.json()
    expect(data.needConfirm).toBe(true)
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('executes when confirmed and audits as player.kick', async () => {
    const res = await POST(req({ action: 'kick', username: 'steve', reason: 'x', confirm: true }))
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(auditCreate).toHaveBeenCalledOnce()
    expect(auditCreate.mock.calls[0][0].data.action).toBe('player.kick')
    expect(auditCreate.mock.calls[0][0].data.target).toBe('steve')
  })

  it('runs broadcast (safe tier) without confirm', async () => {
    const res = await POST(req({ action: 'broadcast', message: 'server restart soon' }))
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('returns 400 on invalid input', async () => {
    const res = await POST(req({ action: 'heal', username: 'bad;name', confirm: true }))
    expect(res.status).toBe(400)
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/__tests__/player-route.test.ts`
Expected: FAIL — cannot find module `@/app/api/admin/player/route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/admin/player/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { buildPlayerCommand, PLAYER_ACTIONS } from '@/lib/playerActions'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json() as { action: string; confirm?: boolean } & Record<string, unknown>
  const { action, confirm, ...params } = body

  const def = PLAYER_ACTIONS[action]
  if (!def) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })

  let command: string
  try {
    command = buildPlayerCommand(action, params)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  if (def.tier !== 'safe' && !confirm) {
    return NextResponse.json({ needConfirm: true, action })
  }

  const result = await executeRcon([command])
  await logAdminAction(req, `player.${action}`, {
    target: typeof params.username === 'string' ? params.username : undefined,
    params: { command },
    ok: result.success,
  })
  return NextResponse.json({ ok: result.success, response: result.responses?.[0], error: result.error })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/admin/__tests__/player-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/player/route.ts src/app/api/admin/__tests__/player-route.test.ts
git commit -m "feat(admin): add player action endpoint"
```

---

## Task 8: /api/admin/online route

**Files:**
- Create: `src/app/api/admin/online/route.ts`
- Test: `src/app/api/admin/__tests__/online-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))

import { GET } from '@/app/api/admin/online/route'

function req() {
  return { headers: new Headers() } as unknown as import('next/server').NextRequest
}

describe('admin online route', () => {
  beforeEach(() => { process.env.RCON_MOCK = 'true' })

  it('parses the mock list into player names', async () => {
    const res = await GET(req())
    const data = await res.json()
    expect(data.online).toBe(2)
    expect(data.max).toBe(20)
    expect(data.players).toEqual(['steve', 'alex'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/__tests__/online-route.test.ts`
Expected: FAIL — cannot find module `@/app/api/admin/online/route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/admin/online/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'

export const dynamic = 'force-dynamic'

// Parses vanilla `list` output:
// "There are 2 of 20 players online: steve, alex"
function parseList(text: string): { online: number; max: number; players: string[] } {
  const m = text.match(/There are (\d+) of (?:a max of )?(\d+) players online:?\s*(.*)/i)
  if (!m) return { online: 0, max: 0, players: [] }
  const players = (m[3] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return { online: Number(m[1]), max: Number(m[2]), players }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const result = await executeRcon(['list'])
  if (!result.success) return NextResponse.json({ error: result.error ?? 'RCON недоступен' }, { status: 502 })
  return NextResponse.json(parseList(result.responses?.[0] ?? ''))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/admin/__tests__/online-route.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/online/route.ts src/app/api/admin/__tests__/online-route.test.ts
git commit -m "feat(admin): add online roster endpoint"
```

---

## Task 9: /api/admin/audit route

**Files:**
- Create: `src/app/api/admin/audit/route.ts`
- Test: `src/app/api/admin/__tests__/audit-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/__tests__/audit-route.test.ts`
Expected: FAIL — cannot find module `@/app/api/admin/audit/route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/admin/audit/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const action = req.nextUrl.searchParams.get('action')
  const rows = await prisma.adminAudit.findMany({
    where: action ? { action: { startsWith: action } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(rows)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/admin/__tests__/audit-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/audit/route.ts src/app/api/admin/__tests__/audit-route.test.ts
git commit -m "feat(admin): add audit log list endpoint"
```

---

## Task 10: UI wiring (page.tsx)

No component test harness exists in this repo; this task is verified by typecheck,
build, and manual click-through. Make the changes in `src/app/admin/page.tsx`.

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add types and extend the Tab union**

Near the other interfaces, add:

```ts
interface AuditRow {
  id: string; action: string; target: string | null
  params: Record<string, unknown>; ip: string; ok: boolean; createdAt: string
}
interface OnlineRoster { online: number; max: number; players: string[] }
```

Extend the `Tab` type and `TABS` array:

```ts
type Tab = 'dash' | 'users' | 'online' | 'activity' | 'sessions' | 'orders' | 'crashes' | 'coupons' | 'rcon' | 'audit'
```

Add `{ id: 'online', label: 'Онлайн' }` after `users`, and `{ id: 'audit', label: 'Аудит' }` at the end of `TABS`.

- [ ] **Step 2: Add the player-action helper used by Online tab and User modal**

Add a module-level helper component above `AdminPage`:

```tsx
function PlayerActionBar({ username, onDone }: { username: string; onDone?: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (action: string, params: Record<string, unknown>, destructive = false) => {
    if (destructive && !confirm(`${action} → ${username}?`)) return
    setBusy(action)
    try {
      const r = await fetch('/api/admin/player', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, username, confirm: true, ...params }),
      })
      const d = await r.json()
      toast(r.ok && d.ok ? 'Готово' : (d.error ?? 'Ошибка'), r.ok && d.ok ? 'success' : 'error')
      onDone?.()
    } catch { toast('Ошибка', 'error') } finally { setBusy(null) }
  }
  const btn = "px-2.5 py-1 text-xs border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors"
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} disabled={!!busy} onClick={() => run('heal', {})}>Хил</button>
      <button className={btn} disabled={!!busy} onClick={() => run('feed', {})}>Покормить</button>
      <button className={btn} disabled={!!busy} onClick={() => run('god', {})}>God</button>
      <button className={btn} disabled={!!busy} onClick={() => run('gamemode', { mode: 'survival' })}>GM Survival</button>
      <button className={btn} disabled={!!busy} onClick={() => run('gamemode', { mode: 'creative' })}>GM Creative</button>
      <button className={btn} disabled={!!busy} onClick={() => { const r = prompt('Причина кика:') ?? ''; run('kick', { reason: r || 'Кик администратором' }, true) }}>Кик</button>
      <button className={btn} disabled={!!busy} onClick={() => { const t = prompt('Время мута (напр. 10m):') ?? '10m'; const r = prompt('Причина:') ?? ''; run('mute', { time: t, reason: r || 'Мут' }, true) }}>Мут</button>
      <button className={btn} disabled={!!busy} onClick={() => run('unmute', {})}>Размут</button>
      <button className={btn} disabled={!!busy} onClick={() => run('kill', {}, true)}>Убить</button>
    </div>
  )
}
```

- [ ] **Step 3: Render the action bar in the User modal "Игра" tab**

In `UserModal`, inside the `uTab === 'game'` block, render `<PlayerActionBar username={user.username} />` above the filter row.

- [ ] **Step 4: Add the Online tab component**

Add above `AdminPage`:

```tsx
function OnlineTab() {
  const [roster, setRoster] = useState<OnlineRoster | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try { const r = await fetch('/api/admin/online'); if (r.ok) setRoster(await r.json()) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [load])
  if (loading) return <div className="text-center text-site-muted py-16">Загрузка...</div>
  if (!roster) return <div className="text-center text-site-muted py-16">RCON недоступен</div>
  return (
    <div className="space-y-4">
      <div className="text-site-muted text-xs">{roster.online} / {roster.max} онлайн</div>
      {roster.players.length === 0 ? (
        <div className="text-center text-site-muted py-12">Никого нет в игре</div>
      ) : roster.players.map(name => (
        <div key={name} className="bg-site-block border border-site-border rounded-lg p-3 space-y-2">
          <div className="font-mono font-medium">{name}</div>
          <PlayerActionBar username={name} onDone={load} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Add the Audit tab component**

Add above `AdminPage`:

```tsx
function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [filter, setFilter] = useState('')
  useEffect(() => {
    fetch(`/api/admin/audit${filter ? `?action=${filter}` : ''}`).then(r => r.json()).then(setRows)
  }, [filter])
  const FILTERS = ['', 'user', 'player', 'rcon', 'coupon', 'order']
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f || 'all'} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${filter === f ? 'border-site-accent text-site-accent' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}>
            {f || 'Все'}
          </button>
        ))}
      </div>
      <Table cols={['Время', 'Действие', 'Цель', 'Параметры', 'IP', 'OK']}>
        {rows.map(r => (
          <Tr key={r.id}>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(r.createdAt)}</Td>
            <Td><span className="px-2 py-0.5 rounded text-xs bg-site-border/30 text-site-text font-mono">{r.action}</span></Td>
            <Td className="font-mono text-xs">{r.target ?? '—'}</Td>
            <Td className="text-xs text-site-muted max-w-[280px] truncate">{JSON.stringify(r.params)}</Td>
            <Td className="font-mono text-xs text-site-muted">{r.ip}</Td>
            <Td className={r.ok ? 'text-green-400' : 'text-red-400'}>{r.ok ? 'да' : 'нет'}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}
```

- [ ] **Step 6: Wire the new tabs into load + render**

In `loadTab`, add branches:

```ts
      else if (t === 'online') { /* OnlineTab self-loads */ loaded.current.add(t); return }
      else if (t === 'audit') { /* AuditTab self-loads */ loaded.current.add(t); return }
```

In the render section at the bottom, add:

```tsx
        {tab === 'online' && <OnlineTab />}
        {tab === 'audit' && <AuditTab />}
```

- [ ] **Step 7: Upgrade RconTab to handle needConfirm**

In `RconTab`, replace the `send` function so a `needConfirm` response prompts and re-sends:

```ts
  const send = async (command: string, confirm = false) => {
    const c = command.trim(); if (!c) return; setLoading(true)
    try {
      const r = await fetch('/api/admin/rcon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: c, confirm }) })
      const data = await r.json()
      if (data.needConfirm) {
        const warn = data.tier === 'server' ? '⚠ ВЛИЯЕТ НА СЕРВЕР (stop/restart)' : 'Изменяющая команда'
        if (confirm || window.confirm(`${warn}\n\n${c}\n\nВыполнить?`)) return send(c, true)
        setLoading(false); return
      }
      setHistory(prev => [...prev, { cmd: c, ts: Date.now(), ok: data.success ?? r.ok, result: data.error ?? (data.responses?.[0] ?? (data.success ? 'OK' : JSON.stringify(data))) }])
      if (!data.success && data.error) toast(data.error, 'error'); setCmd('')
    } catch { toast('Ошибка', 'error') } finally { setLoading(false) }
  }
```

Also remove the now-stale yellow note line ("Команды stop, restart … заблокированы из панели.") since blocking is replaced by confirm.

- [ ] **Step 8: Typecheck and build**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Manual verification (dev, RCON mock)**

Run with `RCON_MOCK=true npm run dev`, log into `/admin`, and verify:
- «Аудит» tab lists rows after you run any action.
- «Онлайн» tab shows the mock roster (steve, alex); action buttons toast "Готово" and add an audit row.
- RCON tab: `list` runs directly; `op steve` pops a confirm; `stop` pops a red server-warning confirm.
- User modal «Игра» tab shows the action bar.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): audit + online tabs, player action bar, RCON confirm UI"
```

---

## Full verification

- [ ] Run the whole suite: `npx vitest run` — all PASS.
- [ ] `npm run lint && npx tsc --noEmit` — clean.
- [ ] `npm run build` — succeeds.
- [ ] Confirm the migration applies cleanly on a fresh DB: `npx prisma migrate reset --force` (dev only).
```
