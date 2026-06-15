# Two-Factor Authentication — Design Spec

**Status:** Design approved (decisions locked 2026-06-15). Pending: user review of this spec → implementation plan.

## Goal

Add opt-in 2FA for player accounts and mandatory 2FA for the admin panel on the NATUX WORLD backend (Next.js 14 / Prisma 7 / Postgres), without breaking the Electron launcher or the vanilla Minecraft (yggdrasil) login path.

## Locked product decisions

| Decision | Choice |
|---|---|
| Method | **Both** TOTP (authenticator app) **and** email-OTP — user picks per account |
| Game login (yggdrasil) | **App-passwords** — a 2FA-enabled user's main password is rejected by yggdrasil; only a generated app-password works |
| Account recovery | **10 one-time backup codes** (shown once at enrollment, stored hashed) |
| Scope | **Opt-in** for players; **mandatory TOTP** for admin |

## Out of scope (explicitly)

- **Launcher UI changes.** The Electron launcher is a separate repo. App-passwords are entered in the existing password field — no launcher change required. (A future launcher update could add a dedicated app-password field, tracked separately.)
- WebAuthn / passkeys.
- SMS OTP.

## Threat → fix

| Concern | Fixed by |
|---|---|
| Stolen account password → full account takeover | 2FA on web `/login` (TOTP/email) |
| Stolen password → game access | App-passwords: main password rejected at yggdrasil for 2FA users |
| Admin panel = single shared password, highest value | Mandatory admin TOTP |
| Lost second factor → permanent lockout | Backup codes |
| DB leak exposes TOTP secrets | `totpSecret` encrypted at rest (AES-GCM, key from env) |
| Brute-force the 6-digit code | Hard rate-limit + account lockout on the verify step |

---

## Data model (Prisma)

**`User` — new fields:**
- `twoFactorEnabled    Boolean   @default(false)`
- `twoFactorMethod     String?`   — `"totp"` | `"email"` | null
- `totpSecretEnc       String?`   — AES-GCM-encrypted base32 TOTP secret (null for email method)
- `twoFactorCode       String?`   — transient email-OTP hash issued during a login challenge
- `twoFactorCodeExpires DateTime?`

**New table `TwoFactorBackupCode`:**
- `id`, `userId` (FK), `codeHash` (sha256 of the code), `usedAt DateTime?`, `createdAt`
- Index on `userId`.

**New table `AppPassword`:**
- `id`, `userId` (FK), `label String`, `hash String` (bcrypt), `createdAt`, `lastUsedAt DateTime?`
- Index on `userId`.

**Admin:** no DB row (admin is env-based). New env `ADMIN_TOTP_SECRET` (base32) holds the admin authenticator secret. `check-secrets` requires it.

**Migrations:** one per table/field group, applied before code that reads them (same ordering discipline as the auth-hardening plan).

---

## Encryption of TOTP secrets

- New env `TWOFA_ENC_KEY` (32-byte hex). `check-secrets` requires it.
- `src/lib/twofa-crypto.ts`: `encryptSecret(plain): string` / `decryptSecret(enc): string` using `aes-256-gcm` (random IV per secret, IV+tag prepended, base64). A DB leak alone cannot reveal TOTP secrets.

---

## Login flow (two-step)

`POST /api/auth/login` (modified):
1. Validate password + existing lockout/rate-limit/emailVerified checks (unchanged).
2. If `twoFactorEnabled`:
   - Do **not** issue the JWT.
   - Mint a short-lived (5 min) signed **pre-auth challenge token** (HMAC over `{userId, purpose:"2fa", iat}`), separate secret/claim from the real JWT so it cannot be used as a session.
   - If method `email`: generate a 6-digit code, store its hash in `twoFactorCode`/`twoFactorCodeExpires`, email it.
   - Return `{ twoFactorRequired: true, method, challenge }` (HTTP 200, no token).
3. If 2FA off: issue JWT as today.

`POST /api/auth/login/2fa` (new):
- Body: `{ challenge, code }`.
- Verify challenge token (valid, not expired, purpose `2fa`).
- **Rate-limit hard** per `(ip, userId)` and account lockout (6-digit space is small).
- Accept `code` as **any** of: current TOTP (±1 window) OR the emailed OTP (if method email) OR an unused backup code (which is then marked `usedAt`).
- On success: issue JWT with current `tokenVersion`. On failure: log `fail`, feed lockout.

---

## Enrollment & management endpoints (web cabinet, authenticated by JWT)

- `POST /api/auth/2fa/totp/setup` — generate a TOTP secret (not yet enabled), store encrypted as pending, return `otpauth://` URI + QR data-URL.
- `POST /api/auth/2fa/totp/enable` — body `{ code }`; verify against pending secret; set `twoFactorEnabled=true, method="totp"`; generate + return 10 backup codes (once); bump `tokenVersion`.
- `POST /api/auth/2fa/email/enable` — set `method="email", enabled=true` (codes sent at login); return backup codes once; bump `tokenVersion`.
- `POST /api/auth/2fa/disable` — body `{ password, code }`; require both; clear all 2FA fields + backup codes; bump `tokenVersion`.
- `POST /api/auth/2fa/backup-codes/regenerate` — body `{ code }`; replace all codes, return new set once.
- App-passwords:
  - `POST /api/auth/app-passwords` — body `{ label }`; only for 2FA-enabled users; generate a random password, store bcrypt hash, return plaintext once.
  - `GET /api/auth/app-passwords` — list (label, createdAt, lastUsedAt; never the secret).
  - `DELETE /api/auth/app-passwords/[id]`.

All bump `tokenVersion` where they change the security posture (enable/disable).

---

## yggdrasil (game login) change

`POST /api/yggdrasil/authserver/authenticate`:
- After resolving the user: **if `twoFactorEnabled`**, the supplied password must match an `AppPassword` hash (update its `lastUsedAt`). The main `passwordHash` is **not** accepted on this endpoint for 2FA users.
- If `twoFactorEnabled` is false: unchanged (main password).
- Existing rate-limit + lockout + `fail` logging stay.

This keeps the vanilla Minecraft client untouched: the player just types their app-password where they used to type the main one.

---

## Admin (mandatory TOTP)

- `POST /api/admin/login`: require `password` **and** `code`. Verify `code` against `ADMIN_TOTP_SECRET` (TOTP). Existing rate-limit stays.
- Enrollment: a one-off `scripts/admin-totp-setup.mjs` prints the `otpauth://` URI (+ optionally an ASCII QR) for `ADMIN_TOTP_SECRET` so the admin can scan it.
- Admin has no email → TOTP only (no email-OTP, no backup codes; recovery = rotate `ADMIN_TOTP_SECRET` env).

---

## Libraries

- `otplib` — TOTP generation/verification (`authenticator`).
- `qrcode` — render `otpauth://` to a data-URL for the cabinet.

---

## Web cabinet UI

- A `/account/security` page (minimal, follows existing styles — no redesign): shows 2FA status; enable TOTP (QR + verify), enable email-OTP, show/regenerate backup codes, manage app-passwords, disable 2FA.
- Login page: second step that prompts for the code when `twoFactorRequired`.

---

## Security notes

- Verify step (`/login/2fa` and admin login) is the brute-force surface → hard per-(ip,account) rate-limit + shared account lockout.
- Backup codes & app-passwords stored hashed; shown plaintext exactly once.
- TOTP secret encrypted at rest.
- `tokenVersion` bumped on enable/disable so toggling 2FA invalidates existing sessions.
- Pre-auth challenge token is a distinct HMAC purpose — cannot be replayed as a session JWT.
- New required secrets (`TWOFA_ENC_KEY`, `ADMIN_TOTP_SECRET`) added to `check-secrets`.

## Testing (Vitest)

- TOTP round-trip + window tolerance; encrypt/decrypt round-trip.
- Backup code one-time use (second use rejected).
- Email-OTP expiry.
- Login returns challenge (no JWT) when 2FA on; `/login/2fa` issues JWT on valid code; rejects wrong/expired/replayed.
- Verify-step rate-limit returns 429 after N attempts.
- yggdrasil: app-password accepted, main password rejected for 2FA user; both unchanged for non-2FA user.
- Admin login requires valid TOTP.
- `tokenVersion` bumped on enable/disable.

## Phasing (for the implementation plan)

1. Crypto + libs + schema/migrations (no behavior change).
2. TOTP/email enable/disable + backup codes (cabinet core).
3. Two-step login (`/login` + `/login/2fa`).
4. App-passwords + yggdrasil enforcement.
5. Admin mandatory TOTP + enrollment script.
6. Cabinet UI pages.
7. `check-secrets` updates + final verification.
