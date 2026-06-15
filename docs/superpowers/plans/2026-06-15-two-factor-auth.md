# Two-Factor Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in 2FA (TOTP + email-OTP) for player accounts, app-passwords for game login, backup-code recovery, and mandatory TOTP for the admin panel, without breaking the Electron launcher or the vanilla Minecraft yggdrasil flow.

**Architecture:** Backend (Next.js 14 Route Handlers) + a minimal `/account/security` cabinet page. TOTP secrets encrypted at rest (AES-256-GCM). Web `/login` becomes two-step when 2FA is on, gated by a short-lived signed pre-auth challenge. yggdrasil rejects the main password for 2FA users and accepts only generated app-passwords. Admin login requires password + TOTP.

**Tech Stack:** Next.js 14 App Router, Prisma 7 (`@prisma/adapter-pg`), Postgres, `jsonwebtoken` (HS256), `bcryptjs`, `otplib`, `qrcode`, Node `crypto` (aes-256-gcm), Vitest.

Spec: `docs/superpowers/specs/2026-06-15-two-factor-auth-design.md`.

---

## File Structure

**Create:**
- `src/lib/twofaCrypto.ts` — AES-256-GCM encrypt/decrypt for TOTP secrets.
- `src/lib/totp.ts` — thin wrapper over `otplib` (generate secret, verify code, build otpauth URI).
- `src/lib/twofaChallenge.ts` — sign/verify the 5-min pre-auth challenge token.
- `src/lib/backupCodes.ts` — generate/format codes, hash, verify-and-consume.
- `src/lib/appPassword.ts` — generate app-password, hash, verify against a user's set.
- `src/app/api/auth/login/2fa/route.ts` — step-2 verify → issue JWT.
- `src/app/api/auth/2fa/totp/setup/route.ts`, `.../totp/enable/route.ts`
- `src/app/api/auth/2fa/email/enable/route.ts`
- `src/app/api/auth/2fa/disable/route.ts`
- `src/app/api/auth/2fa/backup-codes/regenerate/route.ts`
- `src/app/api/auth/app-passwords/route.ts`, `src/app/api/auth/app-passwords/[id]/route.ts`
- `src/app/account/security/page.tsx` — cabinet UI.
- `scripts/admin-totp-setup.mjs` — print admin otpauth URI.
- Prisma migrations under `prisma/migrations/` (one per group).
- Tests under `src/lib/__tests__/` and `src/app/api/**/__tests__/`.

**Modify:**
- `prisma/schema.prisma` — User fields + `TwoFactorBackupCode`, `AppPassword` models.
- `src/lib/auth.ts` — reuse `signToken`; add helper to read bearer JWT user (if not present).
- `src/app/api/auth/login/route.ts` — branch to challenge when 2FA on.
- `src/app/api/yggdrasil/authserver/authenticate/route.ts` — app-password path for 2FA users.
- `src/app/api/admin/login/route.ts` — require TOTP code.
- `scripts/check-secrets.mjs` — require `TWOFA_ENC_KEY`, `ADMIN_TOTP_SECRET`.

---

## Phase 0: Dependencies + crypto + schema

### Task 0.1: Install libraries

- [ ] **Step 1: Install**

Run: `npm i otplib qrcode && npm i -D @types/qrcode`
Expected: `otplib`, `qrcode` in `dependencies`, types in `devDependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(2fa): add otplib + qrcode"
```

### Task 0.2: AES-GCM secret encryption

**Files:**
- Create: `src/lib/twofaCrypto.ts`
- Test: `src/lib/__tests__/twofaCrypto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/twofaCrypto.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/twofaCrypto'

describe('twofaCrypto', () => {
  beforeEach(() => { process.env.TWOFA_ENC_KEY = 'a'.repeat(64) }) // 32 bytes hex

  it('round-trips a secret', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(enc)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('produces different ciphertext each call (random IV)', () => {
    expect(encryptSecret('X')).not.toBe(encryptSecret('X'))
  })

  it('throws on tampered ciphertext', () => {
    const enc = encryptSecret('secret')
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A')
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/twofaCrypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/twofaCrypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(): Buffer {
  const hex = process.env.TWOFA_ENC_KEY
  if (!hex || hex.length !== 64) throw new Error('TWOFA_ENC_KEY must be 32-byte hex (64 chars)')
  return Buffer.from(hex, 'hex')
}

// Format: base64( iv(12) | tag(16) | ciphertext )
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/twofaCrypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/twofaCrypto.ts src/lib/__tests__/twofaCrypto.test.ts
git commit -m "feat(2fa): AES-256-GCM encryption for TOTP secrets"
```

### Task 0.3: TOTP wrapper

**Files:**
- Create: `src/lib/totp.ts`
- Test: `src/lib/__tests__/totp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/totp.test.ts
import { describe, it, expect } from 'vitest'
import { generateTotpSecret, verifyTotp, otpauthUri } from '@/lib/totp'
import { authenticator } from 'otplib'

describe('totp', () => {
  it('generates a base32 secret', () => {
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]+$/)
    expect(s.length).toBeGreaterThanOrEqual(16)
  })

  it('verifies a current code', () => {
    const s = generateTotpSecret()
    const code = authenticator.generate(s)
    expect(verifyTotp(code, s)).toBe(true)
  })

  it('rejects a wrong code', () => {
    const s = generateTotpSecret()
    expect(verifyTotp('000000', s)).toBe(false)
  })

  it('builds an otpauth uri with issuer and account', () => {
    const uri = otpauthUri('jockey_pockey', 'JBSWY3DPEHPK3PXP')
    expect(uri).toContain('otpauth://totp/')
    expect(uri).toContain('NATUX')
    expect(uri).toContain('jockey_pockey')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/totp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/totp.ts
import { authenticator } from 'otplib'

// Allow ±1 time step (30s) to tolerate clock skew.
authenticator.options = { window: 1 }

export function generateTotpSecret(): string {
  return authenticator.generateSecret() // base32
}

export function verifyTotp(token: string, secret: string): boolean {
  try { return authenticator.verify({ token: token.trim(), secret }) } catch { return false }
}

export function otpauthUri(account: string, secret: string): string {
  return authenticator.keyuri(account, 'NATUX WORLD', secret)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/totp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/totp.ts src/lib/__tests__/totp.test.ts
git commit -m "feat(2fa): TOTP generate/verify/otpauth wrapper"
```

### Task 0.4: Schema + migrations

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260615230000_add_two_factor/migration.sql`

- [ ] **Step 1: Add to `model User`** (after `tokenVersion`):

```prisma
  twoFactorEnabled     Boolean   @default(false)
  twoFactorMethod      String?
  totpSecretEnc        String?
  twoFactorCode        String?
  twoFactorCodeExpires DateTime?
  backupCodes          TwoFactorBackupCode[]
  appPasswords         AppPassword[]
```

- [ ] **Step 2: Add new models** (end of file):

```prisma
model TwoFactorBackupCode {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  codeHash  String
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model AppPassword {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  label      String
  hash       String
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?

  @@index([userId])
}
```

- [ ] **Step 3: Write the migration SQL**

```sql
-- prisma/migrations/20260615230000_add_two_factor/migration.sql
ALTER TABLE "User"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorMethod" TEXT,
  ADD COLUMN "totpSecretEnc" TEXT,
  ADD COLUMN "twoFactorCode" TEXT,
  ADD COLUMN "twoFactorCodeExpires" TIMESTAMP(3);

CREATE TABLE "TwoFactorBackupCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorBackupCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TwoFactorBackupCode_userId_idx" ON "TwoFactorBackupCode"("userId");
ALTER TABLE "TwoFactorBackupCode" ADD CONSTRAINT "TwoFactorBackupCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppPassword" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "AppPassword_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppPassword_userId_idx" ON "AppPassword"("userId");
ALTER TABLE "AppPassword" ADD CONSTRAINT "AppPassword_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Generate client (+ apply on a reachable dev DB)**

Run: `npx prisma generate` (and `npx prisma migrate deploy` where a dev DB is reachable).
Expected: client types include the new fields/models.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260615230000_add_two_factor/
git commit -m "feat(2fa): schema + migration for 2FA, backup codes, app passwords"
```

---

## Phase 1: Backup codes + app-password libs

### Task 1.1: Backup codes

**Files:**
- Create: `src/lib/backupCodes.ts`
- Test: `src/lib/__tests__/backupCodes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/backupCodes.test.ts
import { describe, it, expect } from 'vitest'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

describe('backupCodes', () => {
  it('generates 10 distinct formatted codes', () => {
    const codes = generateBackupCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
  })

  it('hash is stable and not the plaintext', () => {
    const h = hashBackupCode('abcd-efgh')
    expect(h).not.toBe('abcd-efgh')
    expect(hashBackupCode('abcd-efgh')).toBe(h)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/backupCodes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/backupCodes.ts
import { randomBytes, createHash } from 'node:crypto'

function chunk(): string {
  // 4 chars from a-z0-9, derived from random bytes
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(4)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function generateBackupCodes(count = 10): string[] {
  const set = new Set<string>()
  while (set.size < count) set.add(`${chunk()}-${chunk()}`)
  return [...set]
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/backupCodes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/backupCodes.ts src/lib/__tests__/backupCodes.test.ts
git commit -m "feat(2fa): backup code generation + hashing"
```

### Task 1.2: App-password lib

**Files:**
- Create: `src/lib/appPassword.ts`
- Test: `src/lib/__tests__/appPassword.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/appPassword.test.ts
import { describe, it, expect } from 'vitest'
import { generateAppPassword, hashAppPassword, verifyAppPassword } from '@/lib/appPassword'

describe('appPassword', () => {
  it('generates a readable password', () => {
    const p = generateAppPassword()
    expect(p).toMatch(/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/)
  })

  it('hashes and verifies', async () => {
    const p = generateAppPassword()
    const h = await hashAppPassword(p)
    expect(await verifyAppPassword(p, [h])).toBe(true)
    expect(await verifyAppPassword('wrong-pass-word-xxxx', [h])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/appPassword.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/appPassword.ts
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateAppPassword(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join(''),
  )
  return groups.join('-')
}

export async function hashAppPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

// Returns true if `plain` matches ANY of the user's stored hashes.
export async function verifyAppPassword(plain: string, hashes: string[]): Promise<boolean> {
  for (const h of hashes) {
    if (await bcrypt.compare(plain, h)) return true
  }
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/appPassword.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appPassword.ts src/lib/__tests__/appPassword.test.ts
git commit -m "feat(2fa): app-password generation/hash/verify"
```

### Task 1.3: Pre-auth challenge token

**Files:**
- Create: `src/lib/twofaChallenge.ts`
- Test: `src/lib/__tests__/twofaChallenge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/twofaChallenge.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { signChallenge, verifyChallenge } from '@/lib/twofaChallenge'

describe('twofaChallenge', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'x'.repeat(40) })

  it('round-trips the userId', () => {
    const t = signChallenge('u_1')
    expect(verifyChallenge(t)).toBe('u_1')
  })

  it('rejects a tampered token', () => {
    const t = signChallenge('u_1')
    expect(verifyChallenge(t + 'z')).toBeNull()
  })

  it('rejects a normal session JWT (wrong purpose)', async () => {
    const { signToken } = await import('@/lib/auth')
    const session = signToken('u_1', 0)
    expect(verifyChallenge(session)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/twofaChallenge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/twofaChallenge.ts
import jwt from 'jsonwebtoken'

// A short-lived token proving "password step passed; awaiting 2FA". Distinct
// `purpose` claim so it can never be used as a session token.
export function signChallenge(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ sub: userId, purpose: '2fa' }, secret, { expiresIn: '5m' })
}

export function verifyChallenge(token: string): string | null {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  try {
    const p = jwt.verify(token, secret) as { sub: string; purpose?: string }
    return p.purpose === '2fa' ? p.sub : null
  } catch { return null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/twofaChallenge.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/twofaChallenge.ts src/lib/__tests__/twofaChallenge.test.ts
git commit -m "feat(2fa): short-lived pre-auth challenge token"
```

---

## Phase 2: Two-step login

### Task 2.1: Branch `/login` to a challenge when 2FA is on

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Add imports** at the top:

```ts
import { signChallenge } from '@/lib/twofaChallenge'
import { generateCode, codeExpiry, sendVerificationEmail } from '@/lib/auth'
import { hashBackupCode } from '@/lib/backupCodes'
```

> Note: `generateCode`/`codeExpiry`/`sendVerificationEmail` already exist in `src/lib/auth.ts` (used for email verification). The email-OTP reuses them. `hashBackupCode` reused to store the emailed code's hash in `twoFactorCode`.

- [ ] **Step 2: Insert the 2FA branch** immediately BEFORE the final `const token = signToken(...)` / success response:

```ts
  if (user.twoFactorEnabled) {
    if (user.twoFactorMethod === 'email') {
      const code = generateCode()
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorCode: hashBackupCode(code), twoFactorCodeExpires: codeExpiry() },
      })
      await sendVerificationEmail(user.email, code)
    }
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'login' })
    return Response.json({ twoFactorRequired: true, method: user.twoFactorMethod, challenge: signChallenge(user.id) })
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/login/route.ts
git commit -m "feat(2fa): /login returns a challenge instead of a JWT when 2FA on"
```

### Task 2.2: `/login/2fa` verify step

**Files:**
- Create: `src/app/api/auth/login/2fa/route.ts`
- Test: `src/app/api/auth/login/__tests__/login-2fa.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/auth/login/__tests__/login-2fa.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const updateMany = vi.fn()
const update = vi.fn()
const bcFindMany = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) },
    twoFactorBackupCode: { findMany: (...a: unknown[]) => bcFindMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) },
  },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig()), logLoginEvent: vi.fn() }))

import { POST } from '@/app/api/auth/login/2fa/route'
import { signChallenge } from '@/lib/twofaChallenge'
import { generateTotpSecret, verifyTotp } from '@/lib/totp'
import { encryptSecret } from '@/lib/twofaCrypto'
import { authenticator } from 'otplib'

function req(body: unknown) {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }), json: async () => body } as unknown as import('next/server').NextRequest
}

describe('POST /api/auth/login/2fa (TOTP)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'x'.repeat(40)
    process.env.TWOFA_ENC_KEY = 'a'.repeat(64)
    findUnique.mockReset(); bcFindMany.mockReset(); bcFindMany.mockResolvedValue([])
  })

  it('issues a JWT for a valid TOTP code', async () => {
    const secret = generateTotpSecret()
    findUnique.mockResolvedValue({ id: 'u_1', username: 'u', email: 'e@e.com', tokenVersion: 0, twoFactorEnabled: true, twoFactorMethod: 'totp', totpSecretEnc: encryptSecret(secret) })
    const res = await POST(req({ challenge: signChallenge('u_1'), code: authenticator.generate(secret) }))
    expect(res.status).toBe(200)
    expect((await res.json()).token).toBeTruthy()
  })

  it('rejects a wrong code', async () => {
    const secret = generateTotpSecret()
    findUnique.mockResolvedValue({ id: 'u_1', twoFactorEnabled: true, twoFactorMethod: 'totp', totpSecretEnc: encryptSecret(secret), tokenVersion: 0 })
    const res = await POST(req({ challenge: signChallenge('u_1'), code: '000000' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid challenge', async () => {
    const res = await POST(req({ challenge: 'garbage', code: '123456' }))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/auth/login/__tests__/login-2fa.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/app/api/auth/login/2fa/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { signToken, formatUser, apiError, logLoginEvent } from '@/lib/auth'
import { clientIp } from '@/lib/clientIp'
import { rateLimit } from '@/lib/ratelimit'
import { isLockedOut } from '@/lib/lockout'
import { verifyChallenge } from '@/lib/twofaChallenge'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''

  let body: { challenge?: string; code?: string }
  try { body = await req.json() } catch { return apiError('bad_request', 'Некорректный запрос', 400) }
  const { challenge, code } = body
  if (!challenge || !code) return apiError('bad_request', 'Код обязателен', 400)

  const userId = verifyChallenge(challenge)
  if (!userId) return apiError('token_invalid', 'Сессия подтверждения истекла', 401)

  // The 6-digit space is small; cap attempts hard.
  if (!rateLimit(`2fa:ip:${ip}`, 30, 60_000) || !rateLimit(`2fa:${ip}:${userId}`, 6, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.twoFactorEnabled) return apiError('unauthorized', 'Недоступно', 403)
  if (await isLockedOut(user.id)) return apiError('rate_limited', 'Слишком много попыток, попробуйте позже', 429)

  const trimmed = code.trim()
  let ok = false

  if (user.twoFactorMethod === 'totp' && user.totpSecretEnc) {
    ok = verifyTotp(trimmed, decryptSecret(user.totpSecretEnc))
  } else if (user.twoFactorMethod === 'email') {
    ok = !!user.twoFactorCode && !!user.twoFactorCodeExpires &&
      user.twoFactorCodeExpires > new Date() &&
      user.twoFactorCode === hashBackupCode(trimmed)
  }

  // Backup code fallback (works for either method).
  if (!ok) {
    const match = await prisma.twoFactorBackupCode.findFirst({
      where: { userId: user.id, codeHash: hashBackupCode(trimmed), usedAt: null },
    })
    if (match) {
      await prisma.twoFactorBackupCode.update({ where: { id: match.id }, data: { usedAt: new Date() } })
      ok = true
    }
  }

  if (!ok) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('bad_credentials', 'Неверный код', 401)
  }

  // Clear any consumed email OTP.
  if (user.twoFactorCode) {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorCode: null, twoFactorCodeExpires: null } })
  }
  await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'login' })
  return Response.json({ token: signToken(user.id, user.tokenVersion), user: formatUser(user) })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/auth/login/__tests__/login-2fa.test.ts`
Expected: PASS (3 tests). Adjust the test's prisma mock to include `twoFactorBackupCode.findFirst` if needed — add `findFirst: vi.fn().mockResolvedValue(null)` to the mock.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/login/2fa/ src/app/api/auth/login/__tests__/login-2fa.test.ts
git commit -m "feat(2fa): /login/2fa verify step (TOTP/email/backup) issues JWT"
```

---

## Phase 3: Enrollment + management endpoints

> Shared helper: every endpoint reads the caller's JWT from the `Authorization: Bearer` header and loads the user. Add it once.

### Task 3.1: Bearer-user helper

**Files:**
- Modify: `src/lib/auth.ts`
- Test: `src/lib/__tests__/bearer-user.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/bearer-user.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { bearerUserId } from '@/lib/auth'
import { signToken } from '@/lib/auth'

describe('bearerUserId', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'x'.repeat(40) })
  it('extracts the user id from a Bearer token', () => {
    const h = new Headers({ authorization: `Bearer ${signToken('u_9', 0)}` })
    expect(bearerUserId(h)).toBe('u_9')
  })
  it('returns null without a token', () => {
    expect(bearerUserId(new Headers())).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bearer-user.test.ts`
Expected: FAIL — `bearerUserId` not exported.

- [ ] **Step 3: Add to `src/lib/auth.ts`**

```ts
export function bearerUserId(headers: Headers): string | null {
  const h = headers.get('authorization') ?? ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return null
  try { return verifyToken(token).sub } catch { return null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bearer-user.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/bearer-user.test.ts
git commit -m "feat(2fa): bearerUserId helper"
```

### Task 3.2: TOTP setup + enable

**Files:**
- Create: `src/app/api/auth/2fa/totp/setup/route.ts`, `src/app/api/auth/2fa/totp/enable/route.ts`

- [ ] **Step 1: setup route**

```ts
// src/app/api/auth/2fa/totp/setup/route.ts
import { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { generateTotpSecret, otpauthUri } from '@/lib/totp'
import { encryptSecret } from '@/lib/twofaCrypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)

  const secret = generateTotpSecret()
  // Store as pending secret (enabled only after /enable confirms a code).
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret) } })

  const uri = otpauthUri(user.username, secret)
  const qr = await QRCode.toDataURL(uri)
  return Response.json({ otpauthUri: uri, qr })
}
```

- [ ] **Step 2: enable route**

```ts
// src/app/api/auth/2fa/totp/enable/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code) return apiError('bad_request', 'Код обязателен', 400)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.totpSecretEnc) return apiError('bad_request', 'Сначала настройте приложение', 400)
  if (!verifyTotp(code, decryptSecret(user.totpSecretEnc))) return apiError('bad_credentials', 'Неверный код', 401)

  const codes = generateBackupCodes()
  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: 'totp', tokenVersion: { increment: 1 } },
    }),
  ])
  return Response.json({ ok: true, backupCodes: codes })
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/2fa/totp/
git commit -m "feat(2fa): TOTP setup (QR) + enable (with backup codes)"
```

### Task 3.3: email enable, disable, regenerate backup codes

**Files:**
- Create: `src/app/api/auth/2fa/email/enable/route.ts`, `src/app/api/auth/2fa/disable/route.ts`, `src/app/api/auth/2fa/backup-codes/regenerate/route.ts`

- [ ] **Step 1: email/enable**

```ts
// src/app/api/auth/2fa/email/enable/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.emailVerified) return apiError('email_unverified', 'Подтвердите email', 403)

  const codes = generateBackupCodes()
  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: 'email', totpSecretEnc: null, tokenVersion: { increment: 1 } },
    }),
  ])
  return Response.json({ ok: true, backupCodes: codes })
}
```

- [ ] **Step 2: disable** (require password + a valid current code)

```ts
// src/app/api/auth/2fa/disable/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const { password, code } = (await req.json().catch(() => ({}))) as { password?: string; code?: string }
  if (!password || !code) return apiError('bad_request', 'Пароль и код обязательны', 400)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.twoFactorEnabled) return apiError('bad_request', '2FA не включена', 400)
  if (!(await bcrypt.compare(password, user.passwordHash))) return apiError('bad_credentials', 'Неверный пароль', 401)

  let ok = user.twoFactorMethod === 'totp' && !!user.totpSecretEnc && verifyTotp(code, decryptSecret(user.totpSecretEnc))
  if (!ok) {
    const match = await prisma.twoFactorBackupCode.findFirst({ where: { userId, codeHash: hashBackupCode(code), usedAt: null } })
    ok = !!match
  }
  if (!ok && user.twoFactorMethod === 'email') {
    ok = !!user.twoFactorCode && !!user.twoFactorCodeExpires && user.twoFactorCodeExpires > new Date() && user.twoFactorCode === hashBackupCode(code)
  }
  if (!ok) return apiError('bad_credentials', 'Неверный код', 401)

  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorMethod: null, totpSecretEnc: null, twoFactorCode: null, twoFactorCodeExpires: null, tokenVersion: { increment: 1 } },
    }),
  ])
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: backup-codes/regenerate** (require a valid current code)

```ts
// src/app/api/auth/2fa/backup-codes/regenerate/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code) return apiError('bad_request', 'Код обязателен', 400)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.twoFactorEnabled) return apiError('bad_request', '2FA не включена', 400)

  let ok = user.twoFactorMethod === 'totp' && !!user.totpSecretEnc && verifyTotp(code, decryptSecret(user.totpSecretEnc))
  if (!ok) {
    const match = await prisma.twoFactorBackupCode.findFirst({ where: { userId, codeHash: hashBackupCode(code), usedAt: null } })
    ok = !!match
  }
  if (!ok) return apiError('bad_credentials', 'Неверный код', 401)

  const codes = generateBackupCodes()
  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
  ])
  return Response.json({ ok: true, backupCodes: codes })
}
```

- [ ] **Step 4: Verify typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/api/auth/2fa/email src/app/api/auth/2fa/disable src/app/api/auth/2fa/backup-codes
git commit -m "feat(2fa): email enable, disable, regenerate backup codes"
```

### Task 3.4: App-password CRUD

**Files:**
- Create: `src/app/api/auth/app-passwords/route.ts`, `src/app/api/auth/app-passwords/[id]/route.ts`

- [ ] **Step 1: collection route (POST create, GET list)**

```ts
// src/app/api/auth/app-passwords/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { generateAppPassword, hashAppPassword } from '@/lib/appPassword'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const list = await prisma.appPassword.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  })
  return Response.json({ appPasswords: list })
}

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.twoFactorEnabled) return apiError('bad_request', 'App-пароли доступны только с включённой 2FA', 400)

  const { label } = (await req.json().catch(() => ({}))) as { label?: string }
  const clean = (label ?? '').trim().slice(0, 40) || 'Игровой пароль'
  const plain = generateAppPassword()
  await prisma.appPassword.create({ data: { userId, label: clean, hash: await hashAppPassword(plain) } })
  return Response.json({ ok: true, label: clean, password: plain })
}
```

- [ ] **Step 2: item route (DELETE)**

```ts
// src/app/api/auth/app-passwords/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  await prisma.appPassword.deleteMany({ where: { id: params.id, userId } }) // scoped to owner
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Verify typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/api/auth/app-passwords
git commit -m "feat(2fa): app-password create/list/delete"
```

---

## Phase 4: yggdrasil app-password enforcement

### Task 4.1: 2FA users authenticate with an app-password

**Files:**
- Modify: `src/app/api/yggdrasil/authserver/authenticate/route.ts`
- Test: `src/app/api/yggdrasil/__tests__/ygg-app-password.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/yggdrasil/__tests__/ygg-app-password.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const apFindMany = vi.fn()
const apUpdateMany = vi.fn()
const gtCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
    appPassword: { findMany: (...a: unknown[]) => apFindMany(...a), updateMany: (...a: unknown[]) => apUpdateMany(...a) },
    gameToken: { create: (...a: unknown[]) => gtCreate(...a) },
  },
}))
vi.mock('@/lib/lockout', () => ({ isLockedOut: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/auth', () => ({ logLoginEvent: vi.fn() }))

import { POST } from '@/app/api/yggdrasil/authserver/authenticate/route'
import bcrypt from 'bcryptjs'
import { generateAppPassword, hashAppPassword } from '@/lib/appPassword'

function req(username: string, password: string) {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.8' }), json: async () => ({ username, password }) } as unknown as import('next/server').NextRequest
}

describe('yggdrasil + 2FA app-password', () => {
  beforeEach(() => { findUnique.mockReset(); apFindMany.mockReset(); gtCreate.mockResolvedValue({}) })

  it('accepts a valid app-password and rejects the main password for a 2FA user', async () => {
    const app = generateAppPassword()
    findUnique.mockResolvedValue({ id: 'u_1', username: 'u', emailVerified: true, twoFactorEnabled: true, passwordHash: await bcrypt.hash('MAIN-password', 10) })
    apFindMany.mockResolvedValue([{ id: 'ap1', hash: await hashAppPassword(app) }])

    expect((await POST(req('u', app))).status).toBe(200)
    expect((await POST(req('u', 'MAIN-password'))).status).toBe(403)
  })

  it('non-2FA user still uses the main password', async () => {
    findUnique.mockResolvedValue({ id: 'u_2', username: 'v', emailVerified: true, twoFactorEnabled: false, passwordHash: await bcrypt.hash('mainpw', 10) })
    expect((await POST(req('v', 'mainpw'))).status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/yggdrasil/__tests__/ygg-app-password.test.ts`
Expected: FAIL — main path still uses `passwordHash` for 2FA users.

- [ ] **Step 3: Modify the route.** Add import:

```ts
import { verifyAppPassword } from '@/lib/appPassword'
```

Replace the existing `const valid = await bcrypt.compare(password, user.passwordHash)` block with:

```ts
  let valid: boolean
  if (user.twoFactorEnabled) {
    // 2FA users must use a generated app-password; the main password is not accepted here.
    const aps = await prisma.appPassword.findMany({ where: { userId: user.id }, select: { hash: true } })
    valid = await verifyAppPassword(password, aps.map((a) => a.hash))
    if (valid) {
      await prisma.appPassword.updateMany({ where: { userId: user.id }, data: { lastUsedAt: new Date() } })
    }
  } else {
    valid = await bcrypt.compare(password, user.passwordHash)
  }
```

> Note: `updateMany` touching all of a user's app-passwords is acceptable (small set). If per-row precision is wanted later, switch to matching the specific row.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/yggdrasil/__tests__/ygg-app-password.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/yggdrasil/authserver/authenticate/route.ts src/app/api/yggdrasil/__tests__/ygg-app-password.test.ts
git commit -m "feat(2fa): yggdrasil accepts app-password (rejects main pw) for 2FA users"
```

---

## Phase 5: Admin mandatory TOTP

### Task 5.1: Require TOTP on admin login

**Files:**
- Modify: `src/app/api/admin/login/route.ts`
- Test: `src/app/api/admin/__tests__/admin-totp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/admin/__tests__/admin-totp.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/adminSession', () => ({ ADMIN_SESSION_TTL_SECONDS: 60, createSessionToken: async () => 'fake.session' }))

import { POST } from '@/app/api/admin/login/route'
import { authenticator } from 'otplib'

function req(password: string, code: string) {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json' }), json: async () => ({ password, code }) } as unknown as import('next/server').NextRequest
}

describe('admin login + TOTP', () => {
  beforeEach(() => {
    ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
    process.env.ADMIN_PASSWORD = 'correct horse battery staple'
    process.env.ADMIN_SECRET = 'x'.repeat(32)
    process.env.ADMIN_TOTP_SECRET = authenticator.generateSecret()
  })

  it('rejects a correct password with a wrong TOTP', async () => {
    expect((await POST(req('correct horse battery staple', '000000'))).status).toBe(401)
  })

  it('accepts correct password + valid TOTP', async () => {
    const code = authenticator.generate(process.env.ADMIN_TOTP_SECRET!)
    expect((await POST(req('correct horse battery staple', code))).status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/__tests__/admin-totp.test.ts`
Expected: FAIL — code not yet checked.

- [ ] **Step 3: Modify the route.** Add import:

```ts
import { verifyTotp } from '@/lib/totp'
```

After the password check passes and BEFORE creating the session, add:

```ts
  const totpSecret = process.env.ADMIN_TOTP_SECRET
  if (!totpSecret || !code || !verifyTotp(code, totpSecret)) {
    return NextResponse.json({ error: 'Неверный код 2FA' }, { status: 401 })
  }
```

(Destructure `code` from the request body alongside `password`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/admin/__tests__/admin-totp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/login/route.ts src/app/api/admin/__tests__/admin-totp.test.ts
git commit -m "feat(2fa): admin login requires TOTP"
```

### Task 5.2: Admin TOTP enrollment script

**Files:**
- Create: `scripts/admin-totp-setup.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/admin-totp-setup.mjs
// Prints an otpauth URI for ADMIN_TOTP_SECRET (set it first) so an admin can scan it.
import { authenticator } from 'otplib'

const secret = process.env.ADMIN_TOTP_SECRET || authenticator.generateSecret()
const uri = authenticator.keyuri('admin', 'NATUX WORLD Admin', secret)
console.log('ADMIN_TOTP_SECRET =', secret)
console.log('otpauth URI       =', uri)
console.log('\nSet ADMIN_TOTP_SECRET in the server env to the value above, then scan the URI.')
```

- [ ] **Step 2: Commit**

```bash
git add scripts/admin-totp-setup.mjs
git commit -m "chore(2fa): admin TOTP enrollment script"
```

---

## Phase 6: Cabinet UI

### Task 6.1: `/account/security` page

**Files:**
- Create: `src/app/account/security/page.tsx`

- [ ] **Step 1: Build the page** (client component; follows existing fetch/styling patterns — calls the endpoints above; shows 2FA status, TOTP QR + verify, email enable, backup codes, app-password manager, disable). Keep it minimal and match the existing cabinet pages' styling utilities.

```tsx
// src/app/account/security/page.tsx
'use client'
import { useEffect, useState } from 'react'

// Reads the stored account JWT the same way other cabinet pages do (e.g. localStorage 'token').
function authHeaders(): HeadersInit {
  const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export default function SecurityPage() {
  const [status, setStatus] = useState<{ twoFactorEnabled: boolean; twoFactorMethod: string | null } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    fetch('/api/auth/me', { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setStatus({ twoFactorEnabled: d.user?.twoFactorEnabled ?? false, twoFactorMethod: d.user?.twoFactorMethod ?? null }))
      .catch(() => {})
  }, [])

  async function setupTotp() {
    const r = await fetch('/api/auth/2fa/totp/setup', { method: 'POST', headers: authHeaders() })
    const d = await r.json(); setQr(d.qr)
  }
  async function enableTotp() {
    const r = await fetch('/api/auth/2fa/totp/enable', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ code }) })
    const d = await r.json(); if (d.backupCodes) { setCodes(d.backupCodes); setQr(null) }
  }

  return (
    <main className="mx-auto max-w-xl p-6 space-y-4">
      <h1 className="text-xl font-bold">Безопасность</h1>
      <p>2FA: {status?.twoFactorEnabled ? `включена (${status.twoFactorMethod})` : 'выключена'}</p>

      {!status?.twoFactorEnabled && (
        <div className="space-y-3">
          <button onClick={setupTotp} className="rounded bg-red-700 px-3 py-2">Настроить приложение (TOTP)</button>
          {qr && (
            <div className="space-y-2">
              <img src={qr} alt="QR" width={180} height={180} />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из приложения" className="rounded border px-2 py-1" />
              <button onClick={enableTotp} className="rounded bg-red-700 px-3 py-2">Включить</button>
            </div>
          )}
        </div>
      )}

      {codes && (
        <div className="rounded border p-3">
          <p className="font-semibold">Сохраните резервные коды (показаны один раз):</p>
          <ul className="font-mono">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
      {/* Email-enable, app-password manager, and disable follow the same fetch pattern. */}
    </main>
  )
}
```

> Note: extend with email-enable, app-password list/create/delete, and disable using the same `authHeaders()` + `fetch` pattern. `/api/auth/me` must include `twoFactorEnabled`/`twoFactorMethod` in its response — add those two fields to the `me` route's `select`/return in this task.

- [ ] **Step 2: Add 2FA status to `/api/auth/me`.** In `src/app/api/auth/me/route.ts`, include `twoFactorEnabled` and `twoFactorMethod` in the returned user object.

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/account/security/page.tsx src/app/api/auth/me/route.ts
git commit -m "feat(2fa): account security cabinet page"
```

---

## Phase 7: Secrets + final verification

### Task 7.1: Require new secrets

**Files:**
- Modify: `scripts/check-secrets.mjs`

- [ ] **Step 1: Add to REQUIRED**

Change the REQUIRED array to:

```js
const REQUIRED = ['JWT_SECRET', 'ADMIN_PASSWORD', 'ADMIN_SECRET', 'GAME_API_KEY', 'TWOFA_ENC_KEY', 'ADMIN_TOTP_SECRET']
```

- [ ] **Step 2: Verify it fails without the new secrets, passes with them**

Run (should FAIL): `JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD=$(openssl rand -hex 12) ADMIN_SECRET=$(openssl rand -hex 24) GAME_API_KEY=$(openssl rand -hex 16) node scripts/check-secrets.mjs; echo $?`
Expected: non-zero (missing TWOFA_ENC_KEY, ADMIN_TOTP_SECRET).

Run (should PASS): add `TWOFA_ENC_KEY=$(openssl rand -hex 32) ADMIN_TOTP_SECRET=$(node -e "console.log(require('otplib').authenticator.generateSecret())")` to the line above.
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-secrets.mjs
git commit -m "chore(2fa): require TWOFA_ENC_KEY + ADMIN_TOTP_SECRET"
```

### Task 7.2: Full suite + typecheck + build

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit
npx vitest run
npx next build
```
Expected: typecheck clean; all tests pass; build succeeds.

- [ ] **Step 2: Deploy notes (record, do not run here)**

On the server, in order: set env `TWOFA_ENC_KEY`, `ADMIN_TOTP_SECRET` (+ scan via `node scripts/admin-totp-setup.mjs`); `npx prisma migrate deploy`; `npx prisma generate`; `npm run check-secrets`; build; `pm2 reload natux-world`.

---

## Self-Review Notes

- **Spec coverage:** method both (TOTP Task 0.3/3.2, email 2.1/3.3) ✓; app-passwords (1.2/3.4/4.1) ✓; backup codes (1.1, enable tasks, login 2.2) ✓; opt-in users + mandatory admin (5.1) ✓; encryption at rest (0.2) ✓; two-step login (2.1/2.2) ✓; challenge token (1.3) ✓; cabinet UI (6.1) ✓; secrets (7.1) ✓.
- **Type consistency:** `signChallenge`/`verifyChallenge`, `generateTotpSecret`/`verifyTotp`/`otpauthUri`, `encryptSecret`/`decryptSecret`, `generateBackupCodes`/`hashBackupCode`, `generateAppPassword`/`hashAppPassword`/`verifyAppPassword`, `bearerUserId` used consistently across tasks.
- **Migration ordering:** Task 0.4 schema/migration precedes all code reading the new fields; deploy notes keep `migrate deploy` before reload.
- **Reused existing helpers:** `signToken`/`verifyToken`/`apiError`/`logLoginEvent`/`generateCode`/`codeExpiry`/`sendVerificationEmail` (auth.ts), `rateLimit`, `clientIp`, `isLockedOut` — no duplication.
- **Known follow-ups (out of scope):** launcher UI for app-password entry; admin recovery beyond rotating `ADMIN_TOTP_SECRET`.
