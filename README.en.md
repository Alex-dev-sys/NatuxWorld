<div align="center">

<img src="public/icon.png" width="110" alt="NATUX WORLD" />

# NATUX WORLD

### A complete Minecraft server business in one repository: launcher, storefront, and server plugin

**One `.exe`, one button — the player is on the server in under a minute.**<br/>
They buy a rank, permissions are granted automatically. No admin in the loop.

<br/>

<a href="README.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-2A2E38?style=for-the-badge&labelColor=0F1117" alt="Русский" /></a>
<a href="README.en.md"><img src="https://img.shields.io/badge/English-FF2B4F?style=for-the-badge&labelColor=0F1117" alt="English" /></a>

<br/><br/>

![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?style=flat-square&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-native-DEA584?style=flat-square&logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma_7-336791?style=flat-square&logo=postgresql&logoColor=white)
![Paper](https://img.shields.io/badge/Paper-1.21.1-EEEEEE?style=flat-square)
<br/>
![Version](https://img.shields.io/badge/version-1.10.0-FF2B4F?style=flat-square)
![Audit](https://img.shields.io/badge/audit-0%20critical-00C853?style=flat-square)

</div>

---

> ### 💼 The whole project is for sale
>
> Both repositories, the domain, the infrastructure, and every document transfer to a single owner.
> The straight-talking checklist of credentials, production checks, and known limits lives in **[docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md)**.

---

## 🎯 What this actually is

The typical Minecraft project runs on a 2010-era forum, sells ranks over direct messages, and tells players to "download the archive and unzip it into `.minecraft`." Players drop off at every step, and the owner hands out permissions by hand.

**NATUX WORLD deletes that entire chain.**

<table>
<tr>
<td width="33%" valign="top">

### 🚀 Launcher
Windows and macOS. Installs Java 21, Minecraft, and Forge 1.21.1 on its own, then joins the server in **one click**. Updates over the air, cryptographically signed.

</td>
<td width="33%" valign="top">

### 🌐 Site + API
Next.js 14 on PostgreSQL. Accounts with 2FA, a **self-hosted Yggdrasil authserver**, a rank store, live payments, and an admin panel with an RCON console.

</td>
<td width="33%" valign="top">

### 🧩 Plugin
Paper 1.21. Streams in-game events, ships an anti-cheat baseline, and feeds the site's leaderboard.

</td>
</tr>
</table>

The three parts were built as **one system**: the site account is the launcher login, which is the in-game name, which is the store customer, which is the leaderboard row. Nothing has to be wired together by hand.

---

## 📊 What's inside, by the numbers

<div align="center">

| | | | |
|:--|--:|:--|--:|
| **Lines of code** | `27,704` | **Automated tests** | `273` ✅ |
| **API endpoints** | `65` | **Test files** | `58` |
| **React components** | `59` | **Database models** | `15` |
| **Launcher services** | `19` | **Prisma migrations** | `21` |

</div>

> The table above is a historical snapshot from before the migration. Run the current checks below: React/Vitest, Rust and the website have separate suites. The user has postponed the live Minecraft join check; unit and packaged smoke tests do not prove a server connection.

---

## ⚡ How it works

```mermaid
flowchart LR
    P(["Player"]) --> L["Launcher"]
    L -->|"sign-up, e-mail code"| S["Site / API"]
    S -->|"JWT"| L
    L -->|"Java 21, Minecraft, Forge"| MC[("Minecraft server")]
    L -->|"quickPlayMultiplayer"| MC
    MC --- PL["Plugin"]
    PL -->|"events, online, anti-cheat"| S
    P -->|"buys a rank"| SHOP["Store"]
    SHOP --> PAY{{"YooKassa · YooMoney · CryptoBot"}}
    PAY -->|"webhook"| S
    S -->|"RCON, LuckPerms"| MC
```

The full player journey — from download to granted rank — **requires zero admin actions**.

---

## 🚀 The launcher

| | |
|---|---|
| 🎮 **One button** | Downloads Minecraft + Forge 1.21.1, installs it, and joins the server directly via `quickPlayMultiplayer` |
| ☕ **Java handled** | Finds Java 21+ on the machine, or downloads and installs it when there is none |
| 🔥 **Headless Forge** | Installs without a single dialog, validates the zip, and self-heals a corrupted download |
| 👤 **Accounts** | Sign up → e-mail code → log in. The account name *is* the in-game name; impersonation is impossible |
| ⚙️ **Settings** | Memory (bounded by actual system RAM), Java selection, resolution, fullscreen, JVM args, auto-start |
| 📜 **Live logs** | Batched install and game log streaming, so the UI never freezes under a heavy download |
| 🩺 **Diagnostics** | One-click environment check plus automatic crash reporting |
| ⏱️ **Playtime** | Hour tracking that handles a hard crash correctly instead of counting idle time |
| 💬 **Discord Rich Presence** | "Playing on the server" status — enabled with a single ID in the config |
| 🔄 **Signed updates** | Control-feed, Tauri package signature, version, filenames and hashes are checked. Windows NSIS updates automatically; macOS and Windows Portable update manually |

<details>
<summary><b>Design: Dark Cyber Fantasy</b></summary>

<br/>

Glass surfaces, premium shadows, red ambient glow. Buttons use Framer Motion spring physics with a glow; the **PLAY** button pulses on a red gradient under a shimmer overlay.

| Token | Color |
|-------|-------|
| Background | `#070707` |
| Card | `#0F1117` · `#141821` |
| Accent | `#FF2B4F` · glow `#FF0037` |
| Discord · Success · Warning | `#5865F2` · `#00FF7F` · `#FF8A00` |

</details>

---

## 🌐 Site, API, and admin panel

| | |
|---|---|
| 🛒 **Rank store** | 7 ranks × 3 durations (30 days / 90 days / permanent), with discount coupons |
| 💳 **Three processors** | YooKassa (cards, SBP), YooMoney, CryptoBot (crypto). `multi` mode runs them side by side |
| ✅ **Auto-fulfillment** | RCON → LuckPerms the moment payment clears, 3 retries, idempotent against double delivery |
| 🔑 **Yggdrasil authserver** | Your own Minecraft auth instead of Mojang: `authenticate`, `refresh`, `validate`, `invalidate`, `join`, `hasJoined` |
| 🔐 **Serious 2FA** | TOTP with QR enrollment, e-mail codes, backup codes, and app passwords for integrations |
| 🛡️ **Admin panel** | Orders, refunds, delivery retries, users, bans, whitelist, RCON console, coupons, stats, audit log, crash reports |
| 🏆 **Leaderboard** | Player rankings built from live plugin data |
| 🟢 **Server status** | Online state, player count, and version on the front page in real time |
| 🎨 **3D scenes** | Three.js world map and winners' podium |
| 🐳 **Deployment** | Docker + Compose + nginx + [`website/vps-setup.sh`](website/vps-setup.sh) — bare VPS to production, documented |

---

## 🧩 Server plugin

Paper API `1.21`, Java, shaded into a single `.jar` by Maven.

- **Anti-cheat baseline** — `AntiCheatListener` and `ViolationTracker` accumulate violations per player.
- **Event buffer** — `EventBuffer` survives network stalls and flushes the remainder cleanly on server shutdown.
- **API delivery** — `ApiSender` authenticates with `GAME_API_KEY`, retries, and refuses to drop data.

---

## 🔐 Security

> Per the internal audit ([`SECURITY_AUDIT.md`](SECURITY_AUDIT.md), re-checked 2026-07-12): **0 critical findings**, grade **B+**, and `npm audit --omit=dev` reports zero advisories.

| Layer | What's in place |
|---|---|
| **Tauri/Rust** | Bundled React, CSP and capabilities; Rust commands validate inputs and native services run without a Node.js sidecar |
| **Downloads** | Pinned SHA-1 for Forge, artifact hash verification, zip-slip protection, and **no HTTPS → HTTP downgrade** on redirects |
| **Tokens** | Rust keyring stores sessions in the OS credential store; unavailable storage means a temporary session reported to the UI. Migration requires signing in again |
| **Updates** | Ed25519-signed manifest. The private key lives **only** in a GitHub Secret; the app ships the public key alone |
| **Passwords** | bcrypt hashing; verification codes stored as SHA-256, TOTP secrets encrypted at rest |
| **Sessions** | `tokenVersion` for instant global revocation, plus rate limiting and lockout on login |
| **Admin** | Mandatory TOTP, IP allowlist, and an audit log entry for every action |

Audit and code review history is kept in the open, including unresolved items: [`AUDIT-2026-06-11`](docs/AUDIT-2026-06-11.md), [`ADVERSARIAL_CODE_REVIEW-2026-08-20`](docs/ADVERSARIAL_CODE_REVIEW_2026-08-20.md), [`CODE-REVIEW-2026-09-06`](docs/CODE-REVIEW-2026-09-06.md), and [`CODE-REVIEW-FULL-2026-09-07`](docs/CODE-REVIEW-FULL-2026-09-07.md).

---

## 🏷️ Rebranding it as your own server

Nothing is **hard-wired** to `vibestudy.ru`. Identity lives in exactly two places:

```ts
// config/launcher-brand.json — shared Rust and TypeScript source
// brand.config.ts — TypeScript facade, build-time
export const BRAND = {
  name: 'NATUX WORLD',
  siteOrigin: 'https://vibestudy.ru',
  serverHost: 'mc.vibestudy.ru',
  minecraftVersionLabel: '1.21.1 Forge',
  discordClientId: '',
};
```

```bash
# site — environment variables
NEXT_PUBLIC_SERVER_NAME=MY SERVER
NEXT_PUBLIC_SITE_DOMAIN=example.com
NEXT_PUBLIC_SERVER_IP=mc.example.com
```

Change the values, run a build, and both the launcher and the site carry your brand.

---

## ⚙️ Quick start

```bash
npm ci
npm run dev          # Tauri/Rust + Vite with hot reload

cd website
npm ci
npm run dev          # Next.js on localhost:3000
```

| Script | What it does |
|--------|-------------|
| `npm run dev` | Development with hot reload |
| `npm run build` | Tauri/Rust and installer for the current OS |
| `npm run build:web` | Tauri React renderer |
| `npm test` | Vitest — UI, bridge and validators |
| `npm run typecheck` | Main Tauri frontend TypeScript |
| `npm run lint` | ESLint |
| `npm run test:packaged` | Tauri executable smoke with an isolated profile |
| `npm run build:portable` | Windows x64 Portable ZIP |
| `npm run test:portable` | Portable startup and profile relocation between directories |
| `npm run electron:install` | Install optional Electron rollback dependencies |
| `npm run electron:build` | Build the separate Electron rollback package |

Desktop builds require a Rust toolchain, C++ build tools and a Java JDK for the lock agent; Windows requires WebView2. See [docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md) for acceptance and release gates. Portable keeps the profile and WebView cache beside the executable; automatic updates and autostart are unsupported. After extraction, launch `Start NATUX WORLD.cmd`: when WebView2 is missing, the helper offers installation and verifies Microsoft Authenticode before running the installer. Installing the runtime on clean Windows remains untested.

<details>
<summary><b>Repository layout</b></summary>

```
NatuxWorld/
├── electron/                   # Optional rollback package with separate dependencies
│   ├── main.ts                 # Window, auto-update, Electron fuses
│   ├── preload.ts              # Context-isolated bridge → window.natux
│   ├── ipc/                    # Channels and handlers
│   └── services/               # 19 services: Launcher, Forge, Java, Minecraft,
│                               # Account, Update, UpdateTrust, Playtime, Discord…
├── src/                        # Renderer: React 19 + Zustand + Tailwind
│   ├── components/auth/        # LoginScreen, RegisterScreen, VerifyEmail, AuthGate
│   ├── store/ · pages/ · hooks/ · lib/
│   ├── services/native-bridge.ts     # Native facade and Tauri bridge
│   ├── native/                 # Primary Tauri application and Rust services
│   ├── profile-lock-core/      # Separate Rust library
│   └── lock-agent/             # Java agent and its tests
├── tests/
│   ├── e2e/                    # Packaging and installed acceptance harnesses
│   └── scripts/                # Tooling and release contracts
├── scripts/                    # Build, verification, and utility tools
├── website/                    # Next.js 14 + Prisma 7 + PostgreSQL
│   ├── src/app/api/            # 65 routes: auth, yggdrasil, payments, admin…
│   ├── src/lib/                # 32 modules: rcon, fulfillment, totp, coupons…
│   ├── prisma/                 # 15 models, 21 migrations
│   ├── natux-plugin/           # Paper plugin (Java)
│   └── Dockerfile · nginx.conf · scripts/vps-setup.sh
└── docs/
    ├── BUYER_HANDOVER.md       # Project handover
    ├── INSTALL.md              # Player installation
    ├── operations/             # Deployment and launcher downloads
    ├── plans/                  # Migrations and plans
    ├── reviews/                # Audits and code reviews
    ├── architecture/           # Architecture diagram exports
    ├── references/             # Reference material
    └── superpowers/            # Historical plans and specifications
```

</details>

---

## 📦 Releases and CI

Source version: **1.10.0**. The default `dev`, `build`, `build:web` and `test:packaged` commands use Tauri. Electron remains an optional rollback package and is not required by the primary dependencies.

The Build workflow validates Windows and Intel/Apple Silicon macOS. Reviewed source policy in `config/launcher-release-policy.json` enables Tauri, migration and 100% rollout by default; missing repository variables do not revert the primary build to Electron. `TAURI_UPDATES_ENABLED`, `TAURI_MIGRATION_ENABLED` and `TAURI_ROLLOUT_PCT` remain explicit operator overrides. Publication requires `TAURI_SIGNING_PRIVATE_KEY` / `UPDATE_SIGNING_PRIVATE_KEY` and successful acceptance. CI validates final NSIS, portable ZIP and macOS DMG artifacts and generates signatures, native executable hashes, checksums and channel feeds. Source policy does not mean publication has already occurred.

The last confirmed GitHub Build on **13 October 2026**, commit `c70ec65` (1.9.15), passed Windows/macOS validation and skipped updater publication. The new 1.10.0 changes still require their own CI run and release. Signed upgrades from a previous version, clean Windows without WebView2 and live Minecraft remain separate acceptance checks. An existing NATUX WORLD 1.9.15 installation in the normal Windows account blocks new local NSIS acceptance; use a clean isolated environment/CI. Release instructions: [docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md).

---

## 📥 Installing it as a player

Windows and macOS, getting past SmartScreen and Gatekeeper, verifying checksums — **[docs/INSTALL.md](docs/INSTALL.md)**.

## 📚 Documentation

- **Handover:** [docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md)
- **Operations:** [HERMES deployment guide](docs/HERMES_DEPLOY.md), [launcher downloads on the site](docs/LAUNCHER_DOWNLOADS_ON_SITE.md)
- **Plans:** [Tauri launcher migration](docs/plans/TAURI_MIGRATION_PLAN.md), [server migration](docs/SERVER_MIGRATION_TZ.md)
- **Audits and reviews:** [docs/](docs/)

---

## 🤝 What the sale includes

- ✅ Both repositories with full history and the audit reports left in the open
- ✅ The Windows and macOS launcher plus a working release pipeline
- ✅ Site, API, admin panel, database schema, and migrations
- ✅ The server plugin with sources
- ✅ Docker configuration and a bare-VPS deployment guide
- ✅ Documentation: handover, install, deploy, server migration, feature specs

### Straight talk about what's missing

Nothing is buried — the limits are listed in [docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md):

- The Windows installer has **no Authenticode certificate**, so SmartScreen shows a warning. Ed25519 protects the update channel, not the publisher name.
- The macOS `.dmg` is **not notarized**, so Gatekeeper may require allowing the app in Privacy & Security.
- OS signing is optional in the chosen release mode; updater and control-feed signatures remain mandatory. The new Tauri release has not been published.

---

<div align="center">

### Want to see it live?

**[mc.vibestudy.ru](https://mc.vibestudy.ru)** · **[Download the launcher](https://github.com/Alex-dev-sys/NatuxWorld/releases)** · **[Handover terms](docs/BUYER_HANDOVER.md)**

<sub>NATUX WORLD · Tauri 2 + Rust · React · Next.js · Paper</sub>

</div>
