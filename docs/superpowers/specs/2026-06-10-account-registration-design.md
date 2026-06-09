# Account Registration & Login — Design Spec

**Date:** 2026-06-10
**Status:** Approved, pending implementation plan
**Scope:** Add a real account system (register + login + email verification) backed by a
vibestudy.ru REST API. Login is required before the player can launch the game. The
account's username becomes the in-game (offline-mode) name. The Minecraft server does
**not** validate the token — the account only gates the launcher.

## Goals

1. On launch, the user must be logged in to reach the launcher home and press PLAY.
2. New users register with nick + email + password (with email confirmation).
3. Returning users log in with nick-or-email + password; the session persists across
   restarts via a stored token.
4. The logged-in `username` is used as the Minecraft offline nick on launch.
5. Logout returns the user to the auth gate.

## Non-goals

- Microsoft / premium (Mojang) authentication.
- Server-side token verification / anti-spoof at the MC layer (anarchy server stays
  offline-mode; the account is a launcher gate only).
- Password reset flow inside the launcher (link out to the website for now).
- Social login (VK/Discord OAuth).

## Architecture

```
renderer (React)
  ├─ AuthGate (shown when no valid session)
  │   ├─ LoginScreen
  │   ├─ RegisterScreen
  │   └─ VerifyEmailScreen
  └─ useAccountStore  ──IPC──►  main: AccountService
                                   └─ HTTPS → https://vibestudy.ru/api/auth/*
                                   └─ token persisted to account.json
```

- **AccountService** (new, `electron/services/AccountService.ts`): owns all HTTP calls,
  token storage, and the `me()` session check. Pure-ish: HTTP isolated behind one
  private `request()` helper for testability.
- **account.json** (in `app.getPath('userData')`): `{ token, user, savedAt }`. Separate
  from the offline `auth.json` that `AuthService` writes (the MC identity). On successful
  login, the launcher also calls the existing `AuthService.login(user.username)` so the
  MC nick matches the account.
- **useAccountStore** (new): `status: 'checking' | 'guest' | 'authed'`, `user`, `error`,
  actions `bootstrap()`, `register()`, `verifyEmail()`, `login()`, `logout()`.
- **AuthGate**: rendered by `App` instead of the launcher when
  `status !== 'authed'`. While `status === 'checking'` show a splash.

## App flow / state machine

```
app start
  └─ accountStore.bootstrap()
       ├─ no token            → guest  → AuthGate (Login)
       ├─ token + /me ok      → authed → Launcher (existing UI)
       └─ token + /me 401     → guest  → AuthGate (token cleared)

AuthGate:
  Login  ──register link──►  Register ──submit──► VerifyEmail ──code ok──► authed
  Login  ──submit ok────────────────────────────────────────────────────► authed
  VerifyEmail ──"resend"──► re-request code
```

PLAY is unreachable until `authed`. The username passed to
`bridge.launcher.play({ username })` is `accountStore.user.username` (replacing the
hardcoded `'Player'`).

## API contract (to be implemented by backend)

Base URL: `https://vibestudy.ru/api/auth`. All requests/responses `application/json`.
All error responses share the shape `{ "error": { "code": string, "message": string } }`
with an appropriate HTTP status. `message` is human-readable Russian for direct display.

### POST /register
Request:
```json
{ "username": "Steve", "email": "a@b.ru", "password": "secret123" }
```
Success `201`:
```json
{ "status": "verification_sent", "email": "a@b.ru" }
```
Errors: `409 username_taken`, `409 email_taken`, `422 validation_failed`,
`429 rate_limited`.

### POST /verify-email
Request:
```json
{ "email": "a@b.ru", "code": "123456" }
```
Success `200`:
```json
{ "token": "<jwt>", "user": { "id": "u_123", "username": "Steve", "email": "a@b.ru" } }
```
Errors: `400 code_invalid`, `410 code_expired`, `429 rate_limited`.

### POST /resend-code
Request: `{ "email": "a@b.ru" }` → `200 { "status": "verification_sent" }`.
Errors: `404 not_found`, `429 rate_limited`.

### POST /login
Request (login accepts username OR email):
```json
{ "login": "Steve", "password": "secret123" }
```
Success `200`:
```json
{ "token": "<jwt>", "user": { "id": "u_123", "username": "Steve", "email": "a@b.ru" } }
```
Errors: `401 bad_credentials`, `403 email_unverified`, `429 rate_limited`.
On `403 email_unverified` the launcher routes to VerifyEmail for that email.

### GET /me
Header: `Authorization: Bearer <token>`.
Success `200`: `{ "user": { "id", "username", "email" } }`.
Errors: `401 token_invalid` (launcher clears token → guest).

### Token
Opaque to the launcher (treated as a string). Expected JWT, long-lived (e.g. 30 days).
The launcher only stores it and sends it as `Authorization: Bearer`. No client-side
decoding required.

### Rate limiting
Backend should rate-limit `/register`, `/verify-email`, `/resend-code`, `/login`. The
launcher surfaces `429` as "Слишком много попыток, подождите".

## Client-side validation (before hitting the API)

- **username**: `^[A-Za-z0-9_]{3,16}$` — Minecraft-compatible nick.
- **email**: standard RFC-ish check (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`).
- **password**: length ≥ 8.
- **register**: password === confirmPassword.
- **verify code**: 6 digits.

Inline field errors; submit disabled until valid.

## Error handling

- Network failure / timeout (6s): "Нет связи с сервером, попробуйте позже" with retry.
- API `error.message` shown verbatim under the form.
- Token cleared automatically on any `/me` 401.

## Security notes

- Password sent over HTTPS only; never logged or written to disk.
- account.json stores token + non-sensitive user fields, never the password.
- The launcher does not implement password reset; a "Забыли пароль?" link opens
  `https://vibestudy.ru/recover` in the browser.

## Testing strategy

- `AccountService`: mock `node:https`; assert request shape, header injection, token
  persistence/clear, `me()` 401 handling, error mapping.
- Validators: pure unit tests (nick/email/password/code).
- UI: manual smoke for the three screens + the gate transition.

## Acceptance criteria

1. Fresh install → AuthGate shown; cannot reach PLAY.
2. Register → email code screen → valid code → lands in launcher, token persisted.
3. Restart app → goes straight to launcher (token still valid via /me).
4. Logout → AuthGate; token removed.
5. Login with wrong password → inline "Неверный логин или пароль".
6. Launching the game uses the account username as the MC nick.
7. `npm test` covers AccountService + validators; `npm run typecheck` green.

## Related

- Settings account section is intentionally out of scope here; see
  [[2026-06-10-launcher-settings-design]] (the account row links back to this flow).
- Reuses the existing offline `AuthService` for the MC identity.
