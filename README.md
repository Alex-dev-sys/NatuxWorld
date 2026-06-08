# NATUX WORLD Launcher

Premium Electron + React 19 + TypeScript + Tailwind launcher for the NATUX WORLD Minecraft server.

## Stack

- Electron 33 (custom titlebar, IPC, services)
- React 19 + React Router 7
- TypeScript (strict)
- TailwindCSS 3 (dark cyber fantasy theme)
- Framer Motion (animations)
- Lucide React (icons)
- Recharts (sparkline stat cards)
- Zustand (state)

## Scripts

```bash
npm install
npm run dev          # launches Vite + Electron in dev mode
npm run build        # builds the renderer + packages the app
npm run typecheck    # tsc --noEmit
```

## Project structure

```
launcher/
├── electron/
│   ├── main.ts                # Electron main process
│   ├── preload.ts             # Context-isolated preload bridge
│   ├── ipc/
│   │   ├── channels.ts        # IPC channel name constants
│   │   └── handlers.ts        # IPC handler registration
│   ├── services/
│   │   ├── LauncherService.ts
│   │   ├── JavaService.ts
│   │   ├── AuthService.ts
│   │   ├── MinecraftService.ts
│   │   ├── UpdateService.ts
│   │   ├── NewsService.ts
│   │   └── SettingsService.ts
│   └── utils/paths.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   │   ├── TitleBar.tsx       # Custom draggable titlebar with window controls
│   │   ├── Sidebar.tsx        # Logo, stats, PLAY button, version, nav, community
│   │   ├── HeroSection.tsx    # Parallax cinematic banner
│   │   ├── StatsCards.tsx     # 4 animated stat cards
│   │   ├── StatCard.tsx
│   │   ├── NewsSection.tsx
│   │   ├── NewsCard.tsx
│   │   ├── NewsModal.tsx
│   │   ├── ServerInfo.tsx
│   │   ├── Footer.tsx
│   │   ├── PlayButton.tsx
│   │   ├── VersionSelector.tsx
│   │   ├── SettingsModal.tsx
│   │   └── ui/ (GlassCard, Button, Tooltip, Spinner)
│   ├── pages/ (HomePage, NewsPage, StorePage, RulesPage, SupportPage)
│   ├── hooks/ (useServerStatus, useNews, useElectron)
│   ├── store/ (useLauncherStore, useAuthStore, useSettingsStore)
│   ├── services/electron-bridge.ts
│   ├── types/ (index, electron.d.ts)
│   ├── utils/ (cn, format)
│   └── data/news.json
└── package.json
```

## Design

Theme: Dark Cyber Fantasy

- Background `#070707`
- Card `#0F1117` / `#141821`
- Primary Red `#FF2B4F` / Glow `#FF0037`
- Discord `#5865F2`, Success `#00FF7F`, Warning `#FF8A00`

All cards use soft glassmorphism, premium shadows, and red-radial ambient lighting. Buttons use Framer Motion spring scale + glow. The PLAY button has an animated pulsing red gradient with shimmer overlay.

## Architecture notes

- **Preload bridge**: `window.natux` exposes typed APIs (`launcher`, `auth`, `java`, `news`, `server`, `settings`, `updater`, `window`, `shell`, `app`).
- **Web fallback**: when running in plain Vite (no Electron context), the same API surface is mocked in `services/electron-bridge.ts` so the UI runs identically in a browser.
- **Service stubs**: every Minecraft / Java / Auth / Update concern has its own service class ready to be implemented (download manifest, spawn JVM, refresh tokens, ...).
- **IPC channels**: centralized constants in `electron/ipc/channels.ts`.
