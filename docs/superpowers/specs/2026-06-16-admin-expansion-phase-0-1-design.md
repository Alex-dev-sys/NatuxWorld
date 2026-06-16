# Admin Panel Expansion — Phase 0+1 Design

**Date:** 2026-06-16
**Repo:** Alex-dev-sys/minecraft-server (Next.js 14 / Prisma 7 / Postgres)
**Status:** Approved direction, awaiting spec review

## Background

The admin panel (`src/app/admin/page.tsx`, 8 tabs) is heavily view-only. Real
control is thin: RCON is gated by a blunt regex block (`stop|restart|ban|op|deop|
kick|execute|whitelist remove` all rejected), there is no per-action audit trail,
and the only player-affecting actions are ban/unban, token revoke, verify toggle,
and give-rank.

Goal: maximum practical admin power, built in 5 phases. Agreed build order:
**0 → 1 → 4 → 3 → 2**.

- **Phase 0** — Foundation: audit log + tiered RCON safety.
- **Phase 1** — Game control: player moderation/control actions via RCON.
- Phase 2 — Server control (start/stop/restart, live console, monitor). *Later.*
- Phase 3 — Economy/content (editable products, refunds, banners). *Later.*
- Phase 4 — Deeper user management (edit email/nick, reset password/2FA). *Later.*

This document specifies **Phase 0 + Phase 1 only**. Each later phase gets its own
spec → plan → implementation cycle.

### Environment facts (verified)

- Single admin (one `ADMIN_SECRET`). **No admin roles/accounts** — dropped (YAGNI).
- MC server runs on the same host as the web app (`RCON_HOST=127.0.0.1`), under a
  supervisor with auto-restart (systemd/docker). Web app runs in Docker, reaches
  host services via `host.docker.internal`.
- RCON works (`src/lib/rcon.ts`, `rcon-client`), has a mock mode
  (`RCON_MOCK=true`), and retries 3× with backoff.
- Server plugins: **LuckPerms 5.5** (ranks, already used by give-rank),
  **EssentialsX 2.21** (`/mute /heal /feed /god /kick /broadcast /tp` etc.),
  spark (profiler — reserved for Phase 2), WorldGuard, mcMMO, and others.
- Rank grants already use safe templating: `buildCommands()` validates username
  against `SAFE_USERNAME = /^[a-zA-Z0-9_]{3,16}$/` and rank against
  `SAFE_ALPHANUMERIC`.

---

## Phase 0 — Foundation

### 0.1 Audit log

Every mutating admin action records an immutable row.

**Prisma model** (`prisma/schema.prisma`):

```
model AdminAudit {
  id        String   @id @default(cuid())
  action    String          // e.g. "user.ban", "player.kick", "rcon.exec"
  target    String?         // username / orderId / coupon code, when applicable
  params    Json            // action-specific payload (reason, item, command, …)
  ip        String          // from requireAdmin request context
  ok        Boolean         // did the action succeed
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([action])
}
```

**Helper** (`src/lib/adminAudit.ts`):

```
logAdminAction(req, action, { target?, params?, ok }): Promise<void>
```

- Pulls IP the same way `requireAdmin`/rate-limit already do (post-nginx
  `$remote_addr`, never client XFF — see auth-hardening notes).
- Never throws into the caller: audit failure logs to console but does not break
  the action. (Wrap body in try/catch.)
- `params` redaction: never store secrets/passwords. RCON command text IS stored
  (it is operational data, not a secret).

**Call sites** (wire into existing + new mutating routes):
`users/[id]` (ban/unban/revoke/verify/give-rank), `coupons` (+`[code]`),
`orders/[id]/retry-delivery`, `rcon`, and the new `player` route (Phase 1).

**UI:** new top-level tab **«Аудит»** in `page.tsx`.
- `GET /api/admin/audit?action=&limit=` → recent rows, newest first, default 100.
- Table: time, action (badge), target, params summary, ok/fail. Filter chips by
  action prefix (`user.*`, `player.*`, `rcon.*`, `coupon.*`, `order.*`).

### 0.2 Tiered RCON

Replace the all-or-nothing `DANGEROUS` regex with a command classifier.

**`src/lib/rconPolicy.ts`:**

```
type RconTier = 'safe' | 'confirm' | 'server'
classifyRcon(command: string): RconTier
```

- **safe** — read/benign: `list`, `tps`, `spark`, `version`, `time query`,
  `say`, `tell`, `weather`, `seed`, `whitelist list`. Run with no friction.
- **confirm** — state-changing: `op`, `deop`, `kick`, `gamemode`, `give`, `tp`,
  `whitelist add/remove`, `mute`, `ban`, `pardon`, `execute`, anything not in
  safe/server. Requires explicit `{confirm:true}`.
- **server** — lifecycle: `stop` (= restart under supervisor), `restart`,
  `save-all`, `save-off`. Requires `{confirm:true}` and is flagged in the UI as
  server-affecting. (Phase 2 builds a dedicated server-control tab; Phase 0 just
  classifies so the raw RCON box handles them safely.)

Default for unknown commands: **confirm** (fail safe, not silently blocked).
`execute` stays in `confirm` because IP-allowlist + admin-auth + audit make it
acceptable, and blocking it outright was security theater (the route is already
trusted). The leading `/` is tolerated.

**Route** (`src/app/api/admin/rcon/route.ts`):

- Body: `{ command, confirm? }`.
- Classify. If tier ∈ {confirm, server} and `!confirm` → respond `200`
  `{ needConfirm: true, tier, command }` (no execution).
- Otherwise execute, then `logAdminAction(req, 'rcon.exec', {params:{command,tier}, ok})`.
- Return the RCON response text (see 1.0 refactor).

**UI** (`RconTab` in `page.tsx`):

- On `needConfirm`, render an inline confirm box showing the command + a
  tier-colored warning (`server` = red, `confirm` = yellow), then re-POST with
  `confirm:true`. Presets that are `safe` run directly as today.

---

## Phase 1 — Game control

### 1.0 RCON response capture (prerequisite refactor)

`executeRcon` currently discards `rcon.send()` responses (console.log only).
Player actions and the online list need the text. Refactor `RconResult` to carry
responses without breaking existing callers:

```
interface RconResult {
  success: boolean
  commands: string[]
  responses?: string[]   // NEW — per-command server reply
  error?: string
}
```

Existing callers ignore `responses`, so this is additive and safe. Mock mode
returns synthetic responses (e.g. `list` → a fixed roster) so tests/dev work
without a live server.

### 1.1 Player action layer

**`src/lib/playerActions.ts`** — safe templated commands, mirroring the
`buildCommands` validation discipline. Reuses `SAFE_USERNAME` and a numeric/enum
guard for params. Each action maps to an EssentialsX/vanilla command:

| action     | command template                       | tier    | source     |
|------------|----------------------------------------|---------|------------|
| kick       | `kick {username} {reason}`             | confirm | vanilla/Ess |
| mute       | `mute {username} {time} {reason}`      | confirm | Essentials |
| unmute     | `unmute {username}`                    | confirm | Essentials |
| heal       | `heal {username}`                      | confirm | Essentials |
| feed       | `feed {username}`                      | confirm | Essentials |
| god        | `god {username}`                       | confirm | Essentials |
| gamemode   | `gamemode {mode} {username}`           | confirm | vanilla    |
| give       | `give {username} {item} {amount}`      | confirm | vanilla/Ess |
| tp_coords  | `tp {username} {x} {y} {z}`            | confirm | vanilla    |
| bring      | `tp {target} {username}`               | confirm | vanilla    |
| kill       | `kill {username}`                      | confirm | vanilla    |
| broadcast  | `broadcast {message}`                  | safe    | Essentials |

Validation rules:
- `username`/`target`: `SAFE_USERNAME`.
- `mode` ∈ {survival, creative, adventure, spectator}.
- `amount`: integer 1–6400; `x/y/z`: finite numbers.
- `item`: `^[a-z0-9_:]+$` (minecraft item id form).
- `reason`/`message`: `SAFE_ALPHANUMERIC`-style, length-capped, no newlines.
- Build the command by substitution only after validation — never interpolate
  raw input. Reject on any failed guard (throw, like `buildCommands`).

Exact EssentialsX syntax for `mute`/`unmute` is verified against the live server
during implementation (TDD); templates above are the design intent. `freeze` is
**omitted** — no freeze plugin installed (revisit with `/jail` in a later phase
if jails get configured).

### 1.2 API

**`POST /api/admin/player`** — body `{ action, username, ...params, confirm? }`.

- `requireAdmin` gate.
- Build command via `playerActions` (validation throws → `400`).
- All player actions are `confirm` tier (except `broadcast`): if `!confirm` →
  `{ needConfirm: true, action }`.
- Execute via `executeRcon`, capture response.
- `logAdminAction(req, 'player.'+action, { target: username, params, ok })`.
- Return `{ ok, response }`.

### 1.3 UI

**User modal — «Игра» tab** (`UserModal` in `page.tsx`): add an action bar above
the game-events table. Quick buttons → mini-forms (kick/mute need reason+time;
give needs item+amount; tp needs coords). Destructive actions (kick/kill/mute)
show an inline confirm before firing. Reuses the existing toast pattern.

**New top-level «Онлайн» tab:**
- `GET /api/admin/online` → runs RCON `list`, parses
  `"There are N of M players online: a, b, c"` into a name array, cross-references
  `game-tokens`/users for linkage.
- Renders a live roster (poll every ~15 s, reuse the SSE-style cadence) with
  per-player action buttons that hit `POST /api/admin/player`. Clicking a name
  opens the existing `UserModal` when the player maps to a known account.

---

## Out of scope (Phase 0+1)

- Admin roles/accounts (single admin — dropped).
- Server start/stop UI, live console streaming, TPS/RAM monitor → **Phase 2**.
- Editable products/prices, refunds, banners, news → **Phase 3**.
- Edit email/nick, password/2FA reset, IP history → **Phase 4**.
- Plugin-specific niche actions (mcMMO skill reset, Wanted, BreweryX,
  MineResetLite, jail/freeze) → backlog, add as "extra commands" later.

## Testing

- `rconPolicy.classifyRcon` — unit tests per tier incl. unknown→confirm,
  leading-`/`, `execute` classification.
- `playerActions` — validation tests: rejects bad username/item/mode/amount,
  builds correct command strings (snapshot the templated output).
- `adminAudit` — logs on success and failure; never throws into caller.
- API routes — `needConfirm` gating (no execution without confirm), audit row
  written, mock RCON path. Follow the existing `src/app/api/admin/__tests__`
  pattern.
- All RCON-touching tests run against mock mode (`RCON_MOCK=true`).

## Migration / deploy notes

- One Prisma migration: `AdminAudit` table. No destructive changes.
- No new prod secrets for Phase 0+1 (RCON already configured).
- `check-secrets` unaffected.
```
