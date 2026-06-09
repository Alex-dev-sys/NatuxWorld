# Launcher Settings — Design Spec

**Date:** 2026-06-10
**Status:** Approved, pending implementation plan
**Scope:** Expand and redesign the existing settings modal into a two-tab panel
(**Игра** / **Лаунчер**) and back it with new settings fields. Builds on the existing
`SettingsService` + `useSettingsStore` + `SettingsModal`. Account management and
folder/cache tools are out of scope.

## Goals

1. Group settings into **Игра** (game runtime) and **Лаунчер** (general) tabs.
2. RAM slider bounded by the machine's real total memory.
3. Java selection: bundled JRE 21 (default) or a custom path, with a "verify" check.
4. Window settings: resolution presets + custom, fullscreen.
5. Launcher general: language, auto-update toggle, auto-launch toggle, reset, version +
   "open logs".
6. Keep the current auto-save-on-change behavior.

## Non-goals

- Folder/cache management (open game dir, clear assets, reinstall) — separate later.
- Account section (handled in [[2026-06-10-account-registration-design]]).
- Per-instance/profile settings.

## Architecture

Extends existing pieces, no new service:

- **SettingsService** (`electron/services/SettingsService.ts`): add fields to
  `LauncherSettings` + defaults. Add one new IPC-exposed call `getSystemMemoryMb()`
  (via `os.totalmem()`) so the renderer can bound the RAM slider. Add a `reset()` that
  rewrites defaults.
- **useSettingsStore**: add `systemMemoryMb`, `loadSystem()`, `reset()`.
- **SettingsModal**: refactor into a tabbed layout. Extract the existing `Row` / `Toggle`
  helpers (already present) and add `Tabs`, `Segmented` (java mode / resolution presets),
  and a file-picker row. Keep auto-save (`update(patch)` on every change).
- **IPC additions**: `settings:getSystemMemory`, `settings:reset`,
  `settings:pickJavaPath` (opens an Electron `dialog.showOpenDialog`),
  `settings:verifyJava` (runs `<path> -version`, returns parsed version or error).

## Data model

```ts
export interface LauncherSettings {
  // existing
  memory: number;                 // MB
  fullscreen: boolean;
  closeOnLaunch: boolean;
  language: 'ru' | 'en';
  javaPath?: string;              // used when javaMode === 'custom'
  jvmArgs: string;
  resolution: { width: number; height: number };
  // new
  javaMode: 'bundled' | 'custom'; // default 'bundled'
  autoUpdate: boolean;            // default true
  autoLaunch: boolean;            // default false — auto-press PLAY on launcher start
}
```

Defaults extend the current `DEFAULTS` block; old settings.json files merge forward
(missing new keys fall back to defaults — already how `get()` works).

## UI — tabs and rows

### Вкладка «Игра»
- **Память (RAM)** — slider `min 1024`, `max = systemMemoryMb` (rounded down to 512),
  step 512, label shows GB. A subtle "рекомендуется" marker at ~50% of system RAM.
- **Java** — segmented `Встроенный JRE 21` / `Свой путь`.
  - When `custom`: text field (read-only) + **Выбрать** (file dialog) + **Проверить**
    button → shows detected version or red error.
  - When `bundled`: row disabled, hint "Используется автоустановленный JRE 21".
- **Разрешение окна** — preset segmented `1280×720 / 1600×900 / 1920×1080 / Своё`.
  - `Своё`: two number inputs W×H (min 640×480).
- **Полноэкранный режим** — toggle (mutually informs resolution: when on, resolution row
  is dimmed with hint "Игнорируется в fullscreen").
- **JVM аргументы** — text + **Сбросить** (restores recommended default string).
- **Закрывать лаунчер при запуске** — toggle (existing).

### Вкладка «Лаунчер»
- **Язык интерфейса** — RU / EN (existing).
- **Авто-обновление** — toggle. When off, `UpdateService.check()` is not scheduled
  (main reads this setting on startup; changing it takes effect next launch — note shown).
- **Автозапуск игры** — toggle. When on, the launcher auto-invokes PLAY once after
  startup (and after auth gate passes).
- **Сбросить настройки** — button → confirm inline → `settings.reset()`.
- **О лаунчере** — version string (`bridge.getVersion()`), **Открыть логи** button →
  navigates to `/logs`, **Папка данных** label (read-only path).

## Behavior details

- **Auto-save**: every control calls `update(patch)`; the "Сохранено / Сохранение…"
  badge stays (already implemented).
- **RAM bound**: if a stored `memory` exceeds detected system RAM (e.g. moved to a
  smaller machine), clamp on load and persist the clamped value.
- **Java verify**: spawns `<path> -version`, parses with the existing
  `JavaService.isJava21Plus`; reused, not duplicated.
- **autoUpdate / autoLaunch** consumed in `electron/main.ts` and `App` respectively.

## Validation

- RAM ∈ [1024, systemMemoryMb].
- Custom resolution: width ≥ 640, height ≥ 480, integers.
- Custom java path: must exist and pass `-version` (verify button); a failing path shows
  an error and is not silently used — fallback remains bundled if verify fails.

## Testing strategy

- `SettingsService`: defaults, forward-merge of old files, `reset()`, clamp logic.
- `getSystemMemoryMb` mocked via `os`.
- Java verify reuses `JavaService` tests.
- UI: manual smoke across both tabs.

## Acceptance criteria

1. Settings open in a two-tab layout; all controls auto-save.
2. RAM slider max equals real system memory; over-limit stored value is clamped.
3. Switching Java to custom + picking a valid JRE passes verify; invalid path errors.
4. Resolution presets + custom both persist and feed the launch (`--width/--height`
   only when not fullscreen).
5. Auto-update toggle off → no update check next start.
6. Reset restores all defaults after confirm.
7. `npm test` covers SettingsService changes; `npm run typecheck` green.

## Related

- Game window settings feed `MinecraftService` launch args (resolution/fullscreen).
- Auto-update toggle gates `UpdateService` (already wired in `main.ts`).
- Account row deliberately excluded — see [[2026-06-10-account-registration-design]].
