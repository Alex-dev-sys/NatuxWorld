# Wave 1 — Infrastructure & Window Controls Fixes

**Date:** 2026-06-08
**Scope:** Repair the foundation: make preload reliably load (fixes broken min/max/close window buttons), unify electron-builder config, deduplicate IPC registration, supply build icons, create missing fallback data file, clean dead code.

This is the first of three planned waves. Wave 2 will wire dead UI buttons (news/store/support/profile menu). Wave 3 will implement real services (launcher pipeline, MS auth, server ping, content from vibestudy.ru). This spec is intentionally limited to Wave 1.

## Problem statement

User reports the top-right window buttons (minimize, maximize, close) do not work in the running Electron app. Audit of the repo surfaced a set of infrastructure issues, with the broken window controls being a symptom of the most severe one (preload loading). Fixing only the visible symptom without also addressing the surrounding fragility would leave repeat regressions when the build pipeline runs in CI.

## Root cause analysis — broken window buttons

`electron/main.ts:28` configures `webPreferences.preload` as `path.join(__dirname, 'preload.mjs')`. The vite-plugin-electron `simple` preset in `vite.config.ts` provides no explicit output filename pin — output extension is implicit from package.json `"type": "module"` and the plugin's defaults. When the emitted filename does not match `preload.mjs`, the preload script silently fails to load, `window.natux` stays `undefined`, the renderer's `bridge` falls through to the no-op web fallback in `src/services/electron-bridge.ts`, and every window-control button becomes a no-op `async () => {}`.

Verification deferred to implementation: actual emitted filename will be inspected after `npm install`. Fix locks the filename regardless.

## Components

### A. Pin preload output filename

**File:** `vite.config.ts`

Change preload config from `{ input: '...' }` to an explicit Vite output config:

```ts
preload: {
  input: path.join(__dirname, 'electron/preload.ts'),
  vite: {
    build: {
      rollupOptions: {
        output: {
          format: 'es',
          entryFileNames: 'preload.mjs',
        },
      },
    },
  },
},
```

Rationale: Electron 33 has stable ESM preload support. Pinning the filename eliminates the implicit-extension trap.

`electron/main.ts:28` (`preload: path.join(__dirname, 'preload.mjs')`) stays as-is — now it matches the emitted file by contract.

**Smoke verification (must be performed before claiming Wave 1 complete):**
- Run `npm install` then `npm run dev`.
- In preload, add `console.log('[preload] loaded');` (temporary, removed before commit if log is noisy, kept if useful for diagnostics).
- Open DevTools in the launched window. Confirm the log appears in the console AND that `window.natux` is defined.
- Click minimize, maximize, close — all three must operate the window.

### B. Deduplicate IPC handler registration

**File:** `electron/main.ts`

Currently `registerWindowControls(mainWindow)` is called inside `createWindow()`. On macOS `app.on('activate')` re-runs `createWindow()` when no windows are open, causing `ipcMain.handle('window:minimize', ...)` to throw `Attempted to register a second handler for ...`.

Refactor:

- Lift the four `ipcMain.handle(...)` calls to a top-level function called once from `app.whenReady()`.
- Replace the captured `win` parameter with `BrowserWindow.fromWebContents(e.sender)` lookups inside each handler. This makes handlers independent of which window invoked them.
- The two `win.on('maximize'|'unmaximize', ...)` event subscriptions stay inside `createWindow` — they are per-window state, not global IPC.

### C. Remove duplicate electron-builder config

**File:** `package.json`

Delete lines 46–68 (the `"build": {...}` object). Single source of truth becomes `electron-builder.yml`. The yml already covers appId, productName, output directory, win/mac/linux targets, and icon paths — no information is lost.

Side effect: the conflicting icon paths disappear (yml says `build/icon.*`, package.json says `public/icon.*`).

### D. Build icons

**Files:** `build/icon.ico`, `build/icon.icns`, `build/icon.png`, `scripts/gen-icons.mjs` (new)

User confirmed they will not supply binary files this iteration. Generate placeholder icons from the existing "N" logo design (red gradient, same as `Sidebar.tsx:47`).

Approach: a Node script using `sharp` (PNG rasterisation from SVG) and `png-to-ico` (Windows ICO multi-resolution). `icon.icns` (macOS) is generated via `iconz` or manual `iconutil` — since macOS builds are not in CI scope (workflow targets `windows-latest` only), a minimal 512×512 PNG renamed as a placeholder is acceptable; macOS builds will produce a warning but not fail.

Script outline:
- Read SVG source string (inline in script — a 512×512 SVG with red radial gradient and white "N" glyph).
- Rasterise to PNGs at 16, 32, 48, 64, 128, 256, 512.
- Combine into `build/icon.ico` via `png-to-ico`.
- Copy 512×512 to `build/icon.png` and (placeholder) `build/icon.icns`.

`sharp` and `png-to-ico` are added as dev dependencies.

`package.json` gets `"icons": "node scripts/gen-icons.mjs"` script and runs it as a prebuild step (`"build": "npm run icons && tsc -b && vite build && electron-builder"`). Generated files are gitignored, so the script must run in CI before electron-builder.

**Update to `.gitignore`:** add `build/icon.ico`, `build/icon.icns`, `build/icon.png` (treat as generated artifacts). The `build/README.md` stays.

**Update to `.github/workflows/build.yml`:** the `npm run build:web` step does not run electron-builder, so insert an `npm run icons` step before the `Package` step.

### E. Create `src/data/news.json`

**File:** `src/data/news.json` (new)

Content: the same three-item array `NewsService.getAll()` currently returns hardcoded (id, title, description, body, image, date, category — matching the `NewsItem` shape from `electron/services/NewsService.ts`).

This unblocks the web-fallback path in `src/services/electron-bridge.ts:33`:

```ts
news: { getAll: async () => (await import('../data/news.json')).default as never }
```

`NewsService` is NOT changed in Wave 1 — it stays hardcoded. Real content sync with vibestudy.ru is Wave 3.

### F. main.ts cleanup

**File:** `electron/main.ts`

- Line 26: `icon: path.join(PUBLIC_DIR, 'icon.png')` → `icon: path.join(process.env.APP_ROOT, 'build', 'icon.png')`. The `PUBLIC_DIR` variable was a holdover from a public-folder convention this project does not follow.
- Lines 76–79 (`app.on('window-all-closed', ...)`): remove the `mainWindow = null` assignment. After `app.quit()` the process exits; the assignment is dead code.

**File:** `package.json`

- Remove `"electron:dev": "vite"` (duplicate of `"dev"`).
- Keep `"electron:build": "electron-builder"` (it's referenced as a recoverable step name).

## Out of scope (explicit)

- Real launcher / Minecraft / Java / MS-auth implementations — Wave 3.
- Dead `onClick` handlers on UI buttons (NewsSection, ServerInfo, Store, profile menu) — Wave 2.
- PlayButton progress simulation, `useSettingsStore.update` double-set, `useLauncherStore.play` error handling — Wave 2.
- Real server ping, real news content — Wave 3.
- Removing `src/components/StatsCards.tsx` hardcoded sidebar stats — Wave 2.

## Testing

This is a stub-heavy Electron app with no existing test infrastructure. Wave 1 does not introduce a test framework — the verification is manual smoke (Section A) plus passing `npm run typecheck` and `npm run build:web` in CI.

CI will be the primary check: the build workflow runs typecheck → build:web → electron-builder. After Wave 1 the workflow must produce a `.exe` with the placeholder icon attached. If the workflow was already green (placeholder fallback icon), the diff is that we now produce the icon ourselves rather than relying on Electron's default.

## Acceptance criteria

1. `npm install && npm run dev` launches the app; DevTools console shows `window.natux` is defined; minimize, maximize, close buttons all operate the window.
2. `npm run build` succeeds locally and produces `release/NATUX WORLD-Setup-1.2.3-x64.exe` with a non-default icon.
3. GitHub Actions `Build` workflow on push to `main` completes successfully, uploads artifact, and (on tagged push) creates a Release.
4. `npm run typecheck` passes.
5. `package.json` contains no `"build"` field. `electron-builder.yml` is the only electron-builder config.
6. `src/data/news.json` exists and is a valid `NewsItem[]` JSON.
7. macOS `app.on('activate')` does not throw an IPC re-registration error (smoke: open the app, close the window without quitting, re-activate the dock icon — but since CI is Windows-only, this is verified by code inspection: window IPC handlers are registered exactly once via `app.whenReady`).

## Risks

- **ESM preload edge case in Electron 33:** if for some reason ESM preload fails (e.g. sandbox interactions), fall back plan is to switch `format: 'es'` → `format: 'cjs'` and `entryFileNames: 'preload.mjs'` → `'preload.cjs'`, and update `electron/main.ts:28` accordingly. Implementation phase verifies this empirically before committing.
- **Placeholder icon quality:** generated icons are functional but not branded. Wave 1 does not block on art — final icons can be dropped into `build/` later and the script can be removed or kept as a regenerator.
- **`sharp` install on Windows runners:** prebuilt binaries usually work, but if `sharp` install fails in CI, the fallback is to commit pre-rendered PNGs (and skip the `gen-icons` script) — decided at implementation time.
