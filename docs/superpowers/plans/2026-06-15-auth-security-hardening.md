# Auth Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the brute-force and token-revocation holes in the NATUX WORLD auth backend (Next.js 14 / Prisma / Postgres) without breaking the existing Electron launcher client.

**Architecture:** Backend-only changes. Add a shared client-IP helper, rate-limit the two currently-unprotected auth endpoints (admin login, Yggdrasil authenticate), add DB-backed per-account lockout using the existing `LoginEvent` table, make user JWTs revocable via a `tokenVersion` column + a server-side logout endpoint, and add HSTS/CSP response headers. The Electron client keeps sending the same opaque `token` string — no client change required.

**Tech Stack:** Next.js 14 App Router (Route Handlers), Prisma 7 (`@prisma/adapter-pg`), Postgres, `jsonwebtoken` (HS256), `bcryptjs`, Vitest.

**Out of scope (separate follow-up plan):** Two-factor authentication (TOTP / email-OTP) at login — it needs Electron client UI work and a product decision (authenticator app vs email code), so it is tracked as its own plan, not here. Migration to RS256 asymmetric JWT signing is also deferred; `tokenVersion` + secret rotation already makes a secret leak recoverable.

---

## Threat → Fix Map

| # | Concern (from user) | Severity | Fixed by |
|---|---------------------|----------|----------|
| A | Brute-force admin password (no rate limit) | P0 | Phase 2 |
| A | Brute-force user password via Yggdrasil endpoint (bypasses `/login` limit) | P0 | Phase 1 + 2 + 3 |
| B | Stolen JWT valid 30d, unrevocable | P0 | Phase 4 |
| C | Rate limiter keyed on spoofable `x-forwarded-for`; no account lockout | P1 | Phase 1 + 3 |
| 5 | JWT secret leak = forge any token, unrecoverable | P0/P1 | Phase 4 (revocation) + Phase 6 (secret hygiene) |
| P2 | No HSTS / CSP | P2 | Phase 5 |
| 2 | No 2FA | P1 | **Separate plan** |
| 3 | Electron decompile | n/a | Not a backend concern |

---

## File Structure

**Create:**
- `src/lib/clientIp.ts` — single source of truth for extracting the real client IP from a request.
- `src/lib/__tests__/clientIp.test.ts` — unit tests for IP parsing.
- `src/lib/lockout.ts` — DB-backed per-account lockout check (counts recent `fail` `LoginEvent` rows).
- `src/lib/__tests__/lockout.test.ts` — unit tests (prisma mocked).
- `src/lib/__tests__/auth-token.test.ts` — unit tests for `signToken`/`verifyToken` with `tokenVersion`.
- `src/app/api/auth/logout/route.ts` — authenticated endpoint that bumps `tokenVersion` (revokes all sessions).
- `src/app/api/auth/__tests__/admin-login-ratelimit.test.ts` — route test proving admin login is rate-limited.
- `prisma/migrations/20260615000000_add_token_version/migration.sql` — adds `tokenVersion` column.
- `scripts/check-secrets.mjs` — fails if production env still holds `.env.example` placeholder secrets.

**Modify:**
- `prisma/schema.prisma` — add `tokenVersion Int @default(0)` to `User`.
- `src/lib/auth.ts` — `signToken(userId, tokenVersion)`, `verifyToken` returns `{ sub, tv }`.
- `src/app/api/auth/login/route.ts` — use `clientIp`, add lockout check, pass `tokenVersion` to `signToken`.
- `src/app/api/auth/verify-email/route.ts` — pass `tokenVersion` to `signToken`.
- `src/app/api/auth/me/route.ts` — verify `tv` against `user.tokenVersion`.
- `src/app/api/auth/game-session/route.ts` — verify `tv` against `user.tokenVersion`.
- `src/app/api/admin/login/route.ts` — add `rateLimit` + `clientIp`.
- `src/app/api/yggdrasil/authserver/authenticate/route.ts` — add `rateLimit` + `clientIp` + lockout.
- `next.config.mjs` — add `Strict-Transport-Security` + `Content-Security-Policy` headers.
- `package.json` — add `"check-secrets"` script.

---

## Phase 1: Trustworthy client IP

The rate limiter keys on `req.headers.get('x-forwarded-for')`. Behind nginx that header is `"<client>, <proxy>…"` when nginx uses `$proxy_add_x_forwarded_for`, or a single value when it overwrites. A client can also pre-set the header. We standardize on **the first IP in the list** (the original client per nginx convention) and trim it. This also requires nginx to overwrite, not append, attacker-controlled XFF — documented in Phase 1 Step 5.

### Task 1.1: Client IP helper

**Files:**
- Create: `src/lib/clientIp.ts`
- Test: `src/lib/__tests__/clientIp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/clientIp.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/clientIp.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/clientIp"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/clientIp.ts
// Single source of truth for the real client IP. nginx must be configured to
// OVERWRITE X-Forwarded-For (not append a client-supplied value) — see plan Phase 1 Step 5.
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/clientIp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Document the required nginx config (no code change, add to DEPLOY.md)**

Append this block to `DEPLOY.md` so the trust assumption is recorded. Replace any append-style XFF with an overwrite so clients cannot forge it:

```nginx
# In the server/location block proxying to Next.js:
proxy_set_header X-Real-IP        $remote_addr;
proxy_set_header X-Forwarded-For  $remote_addr;   # overwrite, do NOT use $proxy_add_x_forwarded_for
proxy_set_header X-Forwarded-Proto $scheme;
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/clientIp.ts src/lib/__tests__/clientIp.test.ts DEPLOY.md
git commit -m "feat(auth): add trustworthy clientIp helper + document nginx XFF overwrite"
```

---

## Phase 2: Rate-limit the unprotected endpoints

`/api/admin/login` and `/api/yggdrasil/authserver/authenticate` currently have **no** `rateLimit()` call, so both are brute-forceable. Add the existing in-memory limiter to both, keyed on the trustworthy client IP.

### Task 2.1: Rate-limit admin login

**Files:**
- Modify: `src/app/api/admin/login/route.ts`
- Test: `src/app/api/auth/__tests__/admin-login-ratelimit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/auth/__tests__/admin-login-ratelimit.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Avoid real Web Crypto session signing in the test.
vi.mock('@/lib/adminSession', () => ({
  ADMIN_SESSION_TTL_SECONDS: 60,
  createSessionToken: async () => 'fake.session.token',
}))

function adminReq(ip: string, password: string) {
  return {
    headers: new Headers({ 'x-forwarded-for': ip, 'content-type': 'application/json' }),
    json: async () => ({ password }),
  } as unknown as import('next/server').NextRequest
}

describe('admin login rate limiting', () => {
  beforeEach(() => {
    // Reset the global in-memory limiter between tests.
    ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
    process.env.ADMIN_PASSWORD = 'correct horse battery staple'
    process.env.ADMIN_SECRET = 'x'.repeat(32)
  })

  it('returns 429 after 5 failed attempts from the same IP within the window', async () => {
    const { POST } = await import('@/app/api/admin/login/route')
    const ip = '203.0.113.99'
    for (let i = 0; i < 5; i++) {
      const res = await POST(adminReq(ip, 'wrong-guess'))
      expect(res.status).toBe(401)
    }
    const blocked = await POST(adminReq(ip, 'wrong-guess'))
    expect(blocked.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/auth/__tests__/admin-login-ratelimit.test.ts`
Expected: FAIL — the 6th attempt returns 401, not 429 (no rate limit yet).

- [ ] **Step 3: Add the rate limit to the route**

Edit `src/app/api/admin/login/route.ts`. Add imports at the top:

```ts
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'
```

Insert this block immediately after `const body = await req.json().catch(() => null)` and its `!body?.password` check, BEFORE reading `process.env.ADMIN_PASSWORD`:

```ts
  const ip = clientIp(req)
  if (!rateLimit(`admin-login:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Слишком много попыток, подождите' }, { status: 429 })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/auth/__tests__/admin-login-ratelimit.test.ts`
Expected: PASS — first 5 attempts 401, 6th is 429.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/login/route.ts src/app/api/auth/__tests__/admin-login-ratelimit.test.ts
git commit -m "fix(auth): rate-limit admin login (5/min per IP) to stop brute force"
```

### Task 2.2: Rate-limit Yggdrasil authenticate

**Files:**
- Modify: `src/app/api/yggdrasil/authserver/authenticate/route.ts`

- [ ] **Step 1: Add the rate limit**

Edit `src/app/api/yggdrasil/authserver/authenticate/route.ts`. Add imports:

```ts
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'
```

Insert immediately after the `const { username, password, clientToken, requestUser } = ...` destructuring and the `if (!username || !password)` guard:

```ts
  const ip = clientIp(req)
  if (!rateLimit(`ygg-auth:${ip}:${username}`, 10, 60_000)) {
    return Response.json(
      { error: 'ForbiddenOperationException', errorMessage: 'Too many requests' },
      { status: 429 },
    )
  }
```

- [ ] **Step 2: Verify the build typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/yggdrasil/authserver/authenticate/route.ts
git commit -m "fix(auth): rate-limit yggdrasil authenticate (closes /login bypass)"
```

---

## Phase 3: DB-backed per-account lockout

In-memory IP rate limiting does not stop a distributed (many-IP) attack against one account. Add a lockout that counts `fail` `LoginEvent` rows for a given `userId` within a window. This survives restarts and works across instances because it lives in Postgres. The `LoginEvent` table and `logLoginEvent` helper already exist.

### Task 3.1: Lockout helper

**Files:**
- Create: `src/lib/lockout.ts`
- Test: `src/lib/__tests__/lockout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/lockout.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const count = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { loginEvent: { count: (...a: unknown[]) => count(...a) } } }))

import { isLockedOut, LOCKOUT_THRESHOLD } from '@/lib/lockout'

describe('isLockedOut', () => {
  beforeEach(() => count.mockReset())

  it('is not locked out below the threshold', async () => {
    count.mockResolvedValue(LOCKOUT_THRESHOLD - 1)
    expect(await isLockedOut('u_1')).toBe(false)
  })

  it('is locked out at the threshold', async () => {
    count.mockResolvedValue(LOCKOUT_THRESHOLD)
    expect(await isLockedOut('u_1')).toBe(true)
  })

  it('counts only fail events for that user within the window', async () => {
    count.mockResolvedValue(0)
    await isLockedOut('u_42')
    const arg = count.mock.calls[0][0] as { where: { userId: string; kind: string; createdAt: { gte: Date } } }
    expect(arg.where.userId).toBe('u_42')
    expect(arg.where.kind).toBe('fail')
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/lockout.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/lockout"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/lockout.ts
import { prisma } from '@/lib/db'

/** Number of recent failures that triggers a temporary account lockout. */
export const LOCKOUT_THRESHOLD = 10
/** Sliding window (ms) over which failures are counted. */
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

/** True when this user has hit the failure threshold within the window. */
export async function isLockedOut(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS)
  const fails = await prisma.loginEvent.count({
    where: { userId, kind: 'fail', createdAt: { gte: since } },
  })
  return fails >= LOCKOUT_THRESHOLD
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/lockout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lockout.ts src/lib/__tests__/lockout.test.ts
git commit -m "feat(auth): add DB-backed per-account lockout helper"
```

### Task 3.2: Enforce lockout in login and yggdrasil

**Files:**
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/yggdrasil/authserver/authenticate/route.ts`

- [ ] **Step 1: Add lockout check to `/login`**

In `src/app/api/auth/login/route.ts`:

Replace the IP line `const ip = req.headers.get('x-forwarded-for') ?? 'unknown'` with:

```ts
  const ip = clientIp(req)
```

Add imports at the top:

```ts
import { clientIp } from '@/lib/clientIp'
import { isLockedOut } from '@/lib/lockout'
```

After the user is fetched and the password is confirmed valid (immediately after the `if (!valid) { … }` block, before the `emailVerified` check), insert:

```ts
  if (await isLockedOut(user.id)) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('rate_limited', 'Слишком много попыток, попробуйте позже', 429)
  }
```

> Note: placing this after the bcrypt check means a correct password during an active lockout still returns 429 — the lock is account-wide while under attack. The `fail` rows are written on every wrong attempt above, which is what drives the count.

- [ ] **Step 2: Add lockout check to yggdrasil authenticate**

In `src/app/api/yggdrasil/authserver/authenticate/route.ts`, add import:

```ts
import { isLockedOut } from '@/lib/lockout'
```

After the `const valid = await bcrypt.compare(...)` / `if (!valid)` block, before generating tokens, insert:

```ts
  if (await isLockedOut(user.id)) {
    return Response.json(
      { error: 'ForbiddenOperationException', errorMessage: 'Account temporarily locked' },
      { status: 429 },
    )
  }
```

> Note: yggdrasil authenticate does not currently call `logLoginEvent`. Add a `fail` log on the two `!valid` / `!user` paths so its attempts feed the same lockout counter. Add after the destructuring import:
> ```ts
> import { logLoginEvent } from '@/lib/auth'
> ```
> and replace the `if (!valid)` early return body with:
> ```ts
>   if (!valid) {
>     await logLoginEvent({ userId: user.id, ip, userAgent: req.headers.get('user-agent') ?? '', kind: 'fail' })
>     return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
>   }
> ```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: all existing + new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/login/route.ts src/app/api/yggdrasil/authserver/authenticate/route.ts
git commit -m "fix(auth): enforce per-account lockout on login + yggdrasil"
```

---

## Phase 4: Revocable JWTs (tokenVersion)

User JWTs are signed `{ sub }` with `expiresIn: '30d'` and no way to revoke. Add a `tokenVersion` integer to `User`, embed it in the token as `tv`, and reject tokens whose `tv` no longer matches the stored value. A new `/api/auth/logout` endpoint (and any future password reset) bumps `tokenVersion`, instantly invalidating every issued token for that user. This also makes a `JWT_SECRET` leak recoverable: rotate the secret OR bump versions.

### Task 4.1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260615000000_add_token_version/migration.sql`

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, inside `model User`, add after `emailVerified`:

```prisma
  tokenVersion       Int       @default(0)
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- prisma/migrations/20260615000000_add_token_version/migration.sql
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Apply migration + regenerate client**

Run (against the dev database — ensure `DATABASE_URL` points at dev):
```bash
npx prisma migrate deploy
npx prisma generate
```
Expected: migration `20260615000000_add_token_version` applied; client regenerated with `tokenVersion` on `User`.

> If the dev DB is unreachable in this environment, run `npx prisma generate` against the schema alone so the TS types include `tokenVersion`, and note that `migrate deploy` must run on the server before deploy.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260615000000_add_token_version/migration.sql
git commit -m "feat(auth): add User.tokenVersion column for JWT revocation"
```

### Task 4.2: Sign/verify with tokenVersion

**Files:**
- Modify: `src/lib/auth.ts`
- Test: `src/lib/__tests__/auth-token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/auth-token.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { signToken, verifyToken } from '@/lib/auth'

describe('signToken / verifyToken with tokenVersion', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xxxx' })

  it('round-trips the user id and token version', () => {
    const token = signToken('u_abc', 3)
    const payload = verifyToken(token)
    expect(payload.sub).toBe('u_abc')
    expect(payload.tv).toBe(3)
  })

  it('defaults tv to 0 when not provided', () => {
    const token = signToken('u_def')
    expect(verifyToken(token).tv).toBe(0)
  })

  it('throws on a tampered token', () => {
    const token = signToken('u_ghi', 0)
    expect(() => verifyToken(token + 'x')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/auth-token.test.ts`
Expected: FAIL — `signToken` currently takes one arg; `verifyToken` returns a string, so `.tv` is undefined / type error.

- [ ] **Step 3: Update `auth.ts`**

Replace the `signToken` and `verifyToken` functions in `src/lib/auth.ts` with:

```ts
export function signToken(userId: string, tokenVersion: number = 0): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ sub: userId, tv: tokenVersion }, secret, { expiresIn: '30d' })
}

export function verifyToken(token: string): { sub: string; tv: number } {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  const payload = jwt.verify(token, secret) as { sub: string; tv?: number }
  return { sub: payload.sub, tv: payload.tv ?? 0 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/auth-token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth-token.test.ts
git commit -m "feat(auth): embed tokenVersion (tv) claim in user JWTs"
```

### Task 4.3: Update all token issuers and verifiers

`verifyToken` now returns an object — every caller must be updated, or the build breaks. Issuers must pass `user.tokenVersion`.

**Files:**
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/verify-email/route.ts`
- Modify: `src/app/api/auth/me/route.ts`
- Modify: `src/app/api/auth/game-session/route.ts`

- [ ] **Step 1: Update login issuer**

In `src/app/api/auth/login/route.ts`, change `const token = signToken(user.id)` to:

```ts
  const token = signToken(user.id, user.tokenVersion)
```

- [ ] **Step 2: Update verify-email issuer**

In `src/app/api/auth/verify-email/route.ts`, change `const token = signToken(updated.id)` to:

```ts
  const token = signToken(updated.id, updated.tokenVersion)
```

- [ ] **Step 3: Update `/me` verifier**

In `src/app/api/auth/me/route.ts`, replace the verify + fetch block so `tv` is checked:

```ts
  let claims: { sub: string; tv: number }
  try {
    claims = verifyToken(token)
  } catch {
    return apiError('token_invalid', 'Сессия истекла', 401)
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (!user || user.tokenVersion !== claims.tv) return apiError('token_invalid', 'Сессия истекла', 401)
```

- [ ] **Step 4: Update game-session verifier**

In `src/app/api/auth/game-session/route.ts`, replace the verify + fetch block:

```ts
  let claims: { sub: string; tv: number }
  try { claims = verifyToken(bearer) } catch { return apiError('token_invalid', 'Сессия истекла', 401) }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (!user || !user.emailVerified || user.tokenVersion !== claims.tv) {
    return apiError('unauthorized', 'Аккаунт не верифицирован', 403)
  }
```

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (all `verifyToken` callers updated).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/login/route.ts src/app/api/auth/verify-email/route.ts src/app/api/auth/me/route.ts src/app/api/auth/game-session/route.ts
git commit -m "feat(auth): check tokenVersion on every token verify; issue with current version"
```

### Task 4.4: Logout endpoint (revoke all sessions)

**Files:**
- Create: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// src/app/api/auth/logout/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, apiError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Bumping tokenVersion invalidates every JWT previously issued to this user.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return apiError('token_invalid', 'Сессия истекла', 401)

  let claims: { sub: string; tv: number }
  try { claims = verifyToken(token) } catch { return apiError('token_invalid', 'Сессия истекла', 401) }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (!user || user.tokenVersion !== claims.tv) return apiError('token_invalid', 'Сессия истекла', 401)

  await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } })
  return Response.json({ ok: true })
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/logout/route.ts
git commit -m "feat(auth): add POST /api/auth/logout that revokes all sessions"
```

> **Client note (no change required now):** the Electron `AccountService.clearStored()` already deletes the local token on logout. To make server-side revocation reachable from the launcher, a future client change can call `POST /api/auth/logout` with the bearer token before clearing storage. Tracked, not done here.

---

## Phase 5: Security headers (HSTS + CSP)

### Task 5.1: Add HSTS and CSP

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1: Add the two headers**

In `next.config.mjs`, add these two entries to the `headers` array (after `Permissions-Policy`):

```js
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
```

- [ ] **Step 2: Build to confirm config is valid**

Run: `npx next build`
Expected: build completes. If CSP breaks the marketing site (blocked inline scripts / 3rd-party assets), loosen `script-src`/`connect-src` for those specific origins only — do not remove the directive.

> If `next build` cannot run in this environment (no DB / network), at minimum run `node -e "import('./next.config.mjs').then(m=>console.log(Object.keys(m.default)))"` to confirm the file parses, and verify headers manually after deploy with `curl -sI https://vibestudy.ru | grep -i -E 'strict-transport|content-security'`.

- [ ] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "fix(security): add HSTS and Content-Security-Policy response headers"
```

---

## Phase 6: Secret hygiene guard

A leaked or default `JWT_SECRET`/`ADMIN_PASSWORD` is catastrophic (forge any token / own the admin panel). Add a startup-time guard script that refuses to run with `.env.example` placeholder values, runnable in CI and before deploy.

### Task 6.1: check-secrets script

**Files:**
- Create: `scripts/check-secrets.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```js
// scripts/check-secrets.mjs
// Fails (exit 1) if any required secret is missing, too short, or still a placeholder.
const PLACEHOLDERS = [/change_me/i, /your_/i, /min_32_chars/i, /example/i]
const REQUIRED = ['JWT_SECRET', 'ADMIN_PASSWORD', 'ADMIN_SECRET']

let bad = false
for (const name of REQUIRED) {
  const v = process.env[name]
  if (!v) { console.error(`✗ ${name} is not set`); bad = true; continue }
  if (v.length < 16) { console.error(`✗ ${name} is too short (<16 chars)`); bad = true; continue }
  if (PLACEHOLDERS.some((re) => re.test(v))) { console.error(`✗ ${name} still looks like a placeholder`); bad = true; continue }
  console.log(`✓ ${name} ok`)
}
// JWT_SECRET specifically should be long.
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('✗ JWT_SECRET should be at least 32 chars'); bad = true
}
if (bad) { console.error('\nSecret check FAILED — fix env before deploying.'); process.exit(1) }
console.log('\nAll secrets present and non-default.')
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:

```json
    "check-secrets": "node scripts/check-secrets.mjs",
```

- [ ] **Step 3: Verify it catches a placeholder and passes a good value**

Run (should FAIL with exit 1):
```bash
JWT_SECRET=change_me_min_32_chars_long_random_secret_here ADMIN_PASSWORD=change_me_password ADMIN_SECRET=change_me node scripts/check-secrets.mjs; echo "exit=$?"
```
Expected: `✗` lines, `exit=1`.

Run (should PASS with exit 0):
```bash
JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD="$(openssl rand -hex 12)" ADMIN_SECRET=$(openssl rand -hex 24) node scripts/check-secrets.mjs; echo "exit=$?"
```
Expected: `✓` lines, `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-secrets.mjs package.json
git commit -m "chore(security): add check-secrets guard against default/placeholder secrets"
```

---

## Phase 7: Final verification

### Task 7.1: Full suite + typecheck

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: typecheck clean; all tests pass.

- [ ] **Step 2: Manual black-box re-check after deploy (record results)**

```bash
# Rate limit on admin login (expect a 429 within ~6 quick tries):
for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://vibestudy.ru/api/admin/login -H 'Content-Type: application/json' -d '{"password":"x"}'; done
# Security headers present:
curl -sI https://vibestudy.ru | grep -i -E 'strict-transport|content-security|x-frame'
```
Expected: a `429` appears in the loop; HSTS + CSP headers present.

### Task 7.2: Open the PR

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin security/auth-hardening
gh pr create --title "Auth security hardening: rate limits, account lockout, revocable JWTs" --body "Closes brute-force holes (admin login + yggdrasil authenticate), adds DB-backed per-account lockout, makes user JWTs revocable via tokenVersion + /logout, adds HSTS/CSP and a secret-hygiene guard. 2FA is a separate follow-up."
```

---

## Self-Review Notes

- **Spec coverage:** Concerns A (admin) → Phase 2.1; A (yggdrasil) → Phase 2.2 + 3.2; B (revocation) → Phase 4; C (XFF + lockout) → Phase 1 + 3; 5 (secret leak) → Phase 4 revocation + Phase 6; P2 headers → Phase 5; 2FA → explicitly deferred to a separate plan; Electron decompile → out of scope (no backend action).
- **Type consistency:** `verifyToken` returns `{ sub: string; tv: number }` everywhere (Tasks 4.2–4.4, logout). `signToken(userId, tokenVersion?)` used consistently. `isLockedOut(userId): Promise<boolean>` and `clientIp(req): string` used as defined.
- **Migration ordering:** `tokenVersion` column (Task 4.1) must be applied before code reading `user.tokenVersion` runs in production — Phase 4 keeps schema first.
