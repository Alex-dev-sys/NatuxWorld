# Launcher Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the settings into a two-tab panel (Игра / Лаунчер) with RAM bound to system memory, Java bundled/custom selection, resolution presets, auto-update and auto-launch toggles, and reset.

**Architecture:** Extend the existing `SettingsService` (`settings.json`) with new fields + `reset()` + a `getSystemMemoryMb()` helper; add IPC for memory/reset/java-pick/java-verify; extend `useSettingsStore`; refactor `SettingsModal` into tabs. Game window settings feed `MinecraftService` launch args; auto-update gates `UpdateService`; auto-launch triggers PLAY on startup.

**Tech Stack:** TypeScript strict, Electron 33, React 19, Zustand, Vitest, `node:os`, Electron `dialog`.

**Spec:** `docs/superpowers/specs/2026-06-10-launcher-settings-design.md`

**Commit convention:** No `Co-Authored-By` trailer (per `CLAUDE.md`). Push to `main` after each commit.

---

## File map

| File | Status | Tasks |
|------|--------|-------|
| `electron/services/SettingsService.ts` | modify | T1 |
| `electron/services/__tests__/SettingsService.test.ts` | **create** | T1 |
| `electron/ipc/channels.ts` | modify | T2 |
| `electron/ipc/handlers.ts` | modify | T2 |
| `electron/preload.ts` | modify | T2 |
| `src/types/electron.d.ts` | modify | T2 |
| `src/services/electron-bridge.ts` | modify | T2 |
| `src/store/useSettingsStore.ts` | modify | T3 |
| `src/components/SettingsModal.tsx` | modify (tabbed refactor) | T4, T5, T6 |
| `electron/main.ts` | modify | T7 |
| `src/App.tsx` | modify | T7 |
| `electron/services/MinecraftService.ts` | modify | T7 |
| `electron/services/LauncherService.ts` | modify | T7 |

---

## Task 1: Extend LauncherSettings + reset + clamp

**Files:**
- Modify: `electron/services/SettingsService.ts`
- Create: `electron/services/__tests__/SettingsService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `electron/services/__tests__/SettingsService.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/natux-settings-test' } }));

const files: Record<string, string> = {};
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (p: string) => { if (files[p] === undefined) throw new Error('ENOENT'); return files[p]; }),
    writeFile: vi.fn(async (p: string, d: string) => { files[p] = d; }),
  },
}));

beforeEach(() => { for (const k of Object.keys(files)) delete files[k]; vi.clearAllMocks(); });

describe('SettingsService', () => {
  it('returns defaults including new fields', async () => {
    const { SettingsService } = await import('../SettingsService');
    const s = await new SettingsService().get();
    expect(s.javaMode).toBe('bundled');
    expect(s.autoUpdate).toBe(true);
    expect(s.autoLaunch).toBe(false);
  });

  it('forward-merges an old file missing new keys', async () => {
    const { SettingsService } = await import('../SettingsService');
    const svc = new SettingsService();
    files['/tmp/natux-settings-test/settings.json'] = JSON.stringify({ memory: 8192 });
    const s = await svc.get();
    expect(s.memory).toBe(8192);
    expect(s.autoUpdate).toBe(true); // default filled in
  });

  it('reset() restores defaults', async () => {
    const { SettingsService } = await import('../SettingsService');
    const svc = new SettingsService();
    await svc.set({ memory: 16384, autoUpdate: false });
    const s = await svc.reset();
    expect(s.memory).toBe(4096);
    expect(s.autoUpdate).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run SettingsService`
Expected: FAIL — `javaMode`/`reset` missing.

- [ ] **Step 3: Implement**

In `electron/services/SettingsService.ts`, extend the interface and defaults, add `reset()`:

```ts
export interface LauncherSettings {
  memory: number;
  fullscreen: boolean;
  closeOnLaunch: boolean;
  language: 'ru' | 'en';
  javaPath?: string;
  jvmArgs: string;
  resolution: { width: number; height: number };
  javaMode: 'bundled' | 'custom';
  autoUpdate: boolean;
  autoLaunch: boolean;
}

const DEFAULTS: LauncherSettings = {
  memory: 4096,
  fullscreen: false,
  closeOnLaunch: false,
  language: 'ru',
  jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC',
  resolution: { width: 1280, height: 720 },
  javaMode: 'bundled',
  autoUpdate: true,
  autoLaunch: false,
};
```

Add to the class:

```ts
  async reset(): Promise<LauncherSettings> {
    await fs.writeFile(this.file, JSON.stringify(DEFAULTS, null, 2), 'utf-8');
    return DEFAULTS;
  }
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run SettingsService`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/services/SettingsService.ts electron/services/__tests__/SettingsService.test.ts
git commit -m "feat(settings): new fields (javaMode/autoUpdate/autoLaunch) + reset"
git push origin main
```

---

## Task 2: IPC — system memory, reset, java pick + verify

**Files:**
- Modify: `electron/ipc/channels.ts`, `electron/ipc/handlers.ts`, `electron/preload.ts`
- Modify: `src/types/electron.d.ts`, `src/services/electron-bridge.ts`

- [ ] **Step 1: Channels**

In `electron/ipc/channels.ts`, extend the settings channel group with:

```ts
  GET_SYSTEM_MEMORY: 'settings:getSystemMemory',
  RESET: 'settings:reset',
  PICK_JAVA: 'settings:pickJava',
  VERIFY_JAVA: 'settings:verifyJava',
```

- [ ] **Step 2: Handlers**

In `electron/ipc/handlers.ts`, add imports + handlers:

```ts
import os from 'node:os';
import { dialog } from 'electron';
import { spawn } from 'node:child_process';
import { JavaService } from '../services/JavaService';

  ipcMain.handle('settings:getSystemMemory', () => Math.floor(os.totalmem() / (1024 * 1024)));

  ipcMain.handle('settings:reset', () => settings.reset());

  ipcMain.handle('settings:pickJava', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Выберите java(w).exe' });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('settings:verifyJava', (_e, p: { path: string }) =>
    new Promise<{ ok: boolean; version?: string; error?: string }>((resolve) => {
      const proc = spawn(p.path, ['-version']);
      let out = '';
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        if (JavaService.isJava21Plus(out)) {
          resolve({ ok: true, version: out.match(/version "([^"]+)"/)?.[1] ?? '21+' });
        } else {
          resolve({ ok: false, error: 'Не Java 21+ или неверный путь' });
        }
      });
      proc.on('error', () => resolve({ ok: false, error: 'Файл не запускается' }));
    }));
```

(`settings` is the existing `SettingsService` instance already created in this file.)

- [ ] **Step 3: Preload**

In `electron/preload.ts`, add to the `settings` block of the api:

```ts
      getSystemMemory: () => ipcRenderer.invoke('settings:getSystemMemory'),
      reset: () => ipcRenderer.invoke('settings:reset'),
      pickJava: () => ipcRenderer.invoke('settings:pickJava'),
      verifyJava: (p: unknown) => ipcRenderer.invoke('settings:verifyJava', p),
```

- [ ] **Step 4: Types**

In `src/types/electron.d.ts`, extend the `settings` block of `NatuxAPI`:

```ts
    getSystemMemory: () => Promise<number>;
    reset: () => Promise<LauncherSettings>;
    pickJava: () => Promise<string | null>;
    verifyJava: (p: { path: string }) => Promise<{ ok: boolean; version?: string; error?: string }>;
```

- [ ] **Step 5: Bridge fallback**

In `src/services/electron-bridge.ts`, add to the `settings` fallback:

```ts
      getSystemMemory: async () => 8192,
      reset: async () => ({
        memory: 4096, fullscreen: false, closeOnLaunch: false, language: 'ru' as const,
        jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC', resolution: { width: 1280, height: 720 },
        javaMode: 'bundled' as const, autoUpdate: true, autoLaunch: false,
      }),
      pickJava: async () => null,
      verifyJava: async () => ({ ok: false, error: 'Недоступно в браузере' }),
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add electron/ipc/channels.ts electron/ipc/handlers.ts electron/preload.ts src/types/electron.d.ts src/services/electron-bridge.ts
git commit -m "feat(settings): IPC for system memory, reset, java pick/verify"
git push origin main
```

---

## Task 3: Store additions

**Files:**
- Modify: `src/store/useSettingsStore.ts`

- [ ] **Step 1: Extend store**

In `src/store/useSettingsStore.ts`, add `systemMemoryMb`, `loadSystem`, `reset`. Update the interface:

```ts
interface SettingsState {
  settings: LauncherSettings | null;
  systemMemoryMb: number;
  isOpen: boolean;
  saving: boolean;
  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  loadSystem: () => Promise<void>;
  update: (patch: Partial<LauncherSettings>) => Promise<void>;
  reset: () => Promise<void>;
}
```

Add to the store body:

```ts
  systemMemoryMb: 8192,
  loadSystem: async () => {
    const mb = await bridge.settings.getSystemMemory();
    set({ systemMemoryMb: mb });
    // clamp stored memory to system on load
    const s = get().settings;
    if (s && s.memory > mb) await get().update({ memory: Math.floor(mb / 512) * 512 });
  },
  reset: async () => {
    set({ saving: true });
    try {
      const next = await bridge.settings.reset();
      set({ settings: next });
    } finally {
      set({ saving: false });
    }
  },
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/store/useSettingsStore.ts
git commit -m "feat(settings): store systemMemory + reset + clamp on load"
git push origin main
```

---

## Task 4: SettingsModal — tabbed shell

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Add tab state + Tabs UI**

In `src/components/SettingsModal.tsx`, add a `useState` for the active tab and load system memory on open. At the top of the component:

```tsx
import { useState } from 'react';
// ...
  const [tab, setTab] = useState<'game' | 'launcher'>('game');
  const loadSystem = useSettingsStore((s) => s.loadSystem);

  useEffect(() => {
    if (isOpen && !settings) load();
    if (isOpen) loadSystem();
  }, [isOpen, settings, load, loadSystem]);
```

Add the tab strip directly under the modal header (replace the single content `<div className="flex flex-col gap-3 p-5">` opening with the tab strip + a conditional body):

```tsx
            <div className="flex gap-1 border-b border-white/[0.06] px-5 pt-3">
              {(['game', 'launcher'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                    tab === t ? 'bg-white/[0.05] text-white' : 'text-muted hover:text-white'
                  }`}>
                  {t === 'game' ? 'Игра' : 'Лаунчер'}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 p-5">
              {tab === 'game' ? <GameTab /> : <LauncherTab />}
            </div>
```

Define `GameTab` and `LauncherTab` as components in the same file (filled in Tasks 5 and 6). For this task, stub them so it compiles:

```tsx
function GameTab() { return null; }
function LauncherTab() { return null; }
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat(settings): tabbed modal shell (Игра/Лаунчер)"
git push origin main
```

---

## Task 5: «Игра» tab

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Implement GameTab**

Replace the `GameTab` stub with the full control set. Reuse existing `Row` / `Toggle` helpers already in this file:

```tsx
import { MemoryStick, MonitorPlay, Cpu, Coffee, FolderOpen } from 'lucide-react';

const PRESETS = [
  { w: 1280, h: 720 }, { w: 1600, h: 900 }, { w: 1920, h: 1080 },
];

function GameTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const systemMemoryMb = useSettingsStore((s) => s.systemMemoryMb);
  const memory = settings?.memory ?? 4096;
  const maxMem = Math.floor(systemMemoryMb / 512) * 512;
  const res = settings?.resolution ?? { width: 1280, height: 720 };
  const isPreset = PRESETS.some((p) => p.w === res.width && p.h === res.height);

  const verifyJava = async () => {
    if (!settings?.javaPath) return;
    const r = await bridge.settings.verifyJava({ path: settings.javaPath });
    alert(r.ok ? `Java OK: ${r.version}` : `Ошибка: ${r.error}`);
  };
  const pickJava = async () => {
    const p = await bridge.settings.pickJava();
    if (p) update({ javaPath: p, javaMode: 'custom' });
  };

  return (
    <>
      <Row icon={<MemoryStick className="h-4 w-4" />} label="Память для игры" hint={`${(memory / 1024).toFixed(1)} GB из ${(systemMemoryMb / 1024).toFixed(0)} GB`}>
        <input type="range" min={1024} max={maxMem} step={512} value={Math.min(memory, maxMem)}
          onChange={(e) => update({ memory: Number(e.target.value) })} className="w-56 accent-primary" />
      </Row>

      <Row icon={<Coffee className="h-4 w-4" />} label="Java" stacked>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(['bundled', 'custom'] as const).map((m) => (
              <button key={m} onClick={() => update({ javaMode: m })}
                className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${settings?.javaMode === m ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
                {m === 'bundled' ? 'Встроенный JRE 21' : 'Свой путь'}
              </button>
            ))}
          </div>
          {settings?.javaMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input readOnly value={settings?.javaPath ?? ''} placeholder="Путь к java(w).exe"
                className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs ring-1 ring-white/10" />
              <button onClick={pickJava} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">
                <FolderOpen className="h-4 w-4" />
              </button>
              <button onClick={verifyJava} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">Проверить</button>
            </div>
          )}
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label="Разрешение окна" stacked>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={`${p.w}x${p.h}`} onClick={() => update({ resolution: { width: p.w, height: p.h } })}
              className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${res.width === p.w && res.height === p.h ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
              {p.w}×{p.h}
            </button>
          ))}
          <button onClick={() => update({ resolution: { width: 1366, height: 768 } })}
            className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${!isPreset ? 'bg-primary/15 text-primary' : 'text-muted'}`}>Своё</button>
          {!isPreset && (
            <div className="flex items-center gap-1">
              <input type="number" min={640} value={res.width} onChange={(e) => update({ resolution: { ...res, width: Math.max(640, Number(e.target.value)) } })}
                className="w-20 rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs ring-1 ring-white/10" />
              <span className="text-muted">×</span>
              <input type="number" min={480} value={res.height} onChange={(e) => update({ resolution: { ...res, height: Math.max(480, Number(e.target.value)) } })}
                className="w-20 rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs ring-1 ring-white/10" />
            </div>
          )}
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label="Полноэкранный режим" hint={settings?.fullscreen ? 'Разрешение игнорируется' : 'Оконный режим'}>
        <Toggle value={!!settings?.fullscreen} onChange={(v) => update({ fullscreen: v })} />
      </Row>

      <Row icon={<Cpu className="h-4 w-4" />} label="JVM аргументы" stacked>
        <div className="flex items-center gap-2">
          <input type="text" value={settings?.jvmArgs ?? ''} onChange={(e) => update({ jvmArgs: e.target.value })}
            className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
          <button onClick={() => update({ jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC' })}
            className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">Сбросить</button>
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label="Закрывать лаунчер при запуске" hint="Освобождает ОЗУ">
        <Toggle value={!!settings?.closeOnLaunch} onChange={(v) => update({ closeOnLaunch: v })} />
      </Row>
    </>
  );
}
```

Add `import { bridge } from '../services/electron-bridge';` at the top if not present.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat(settings): Игра tab — RAM/Java/resolution/fullscreen/JVM"
git push origin main
```

---

## Task 6: «Лаунчер» tab

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Implement LauncherTab**

Replace the `LauncherTab` stub:

```tsx
import { Languages, RefreshCw, Rocket, Trash2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function LauncherTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  const close = useSettingsStore((s) => s.close);
  const appVersion = useLauncherStore((s) => s.appVersion);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <Row icon={<Languages className="h-4 w-4" />} label="Язык интерфейса">
        <select value={settings?.language ?? 'ru'} onChange={(e) => update({ language: e.target.value as 'ru' | 'en' })}
          className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary">
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </Row>

      <Row icon={<RefreshCw className="h-4 w-4" />} label="Авто-обновление" hint="Применится при следующем запуске">
        <Toggle value={settings?.autoUpdate ?? true} onChange={(v) => update({ autoUpdate: v })} />
      </Row>

      <Row icon={<Rocket className="h-4 w-4" />} label="Автозапуск игры" hint="Сразу нажимать ИГРАТЬ при старте">
        <Toggle value={!!settings?.autoLaunch} onChange={(v) => update({ autoLaunch: v })} />
      </Row>

      <Row icon={<FileText className="h-4 w-4" />} label="Логи" hint="Открыть страницу логов">
        <button onClick={() => { close(); navigate('/logs'); }}
          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">Открыть</button>
      </Row>

      <Row icon={<Trash2 className="h-4 w-4" />} label="Сбросить настройки" hint={`Версия лаунчера ${appVersion}`}>
        {confirm ? (
          <div className="flex gap-2">
            <button onClick={() => { reset(); setConfirm(false); }} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white">Точно</button>
            <button onClick={() => setConfirm(false)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10">Отмена</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-red-400 ring-1 ring-white/10 hover:bg-white/[0.1]">Сбросить</button>
        )}
      </Row>
    </>
  );
}
```

Add `import { useLauncherStore } from '../store/useLauncherStore';` at the top if not present.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat(settings): Лаунчер tab — language/auto-update/auto-launch/reset/logs"
git push origin main
```

---

## Task 7: Consume settings — autoUpdate, autoLaunch, resolution/fullscreen

**Files:**
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`
- Modify: `electron/services/MinecraftService.ts`
- Modify: `electron/services/LauncherService.ts`

- [ ] **Step 1: Gate UpdateService by autoUpdate**

In `electron/main.ts`, read settings before scheduling the update check. Replace the current unconditional `updater.check()` scheduling with a guarded version:

```ts
import { settings as settingsService } from './ipc/handlers';

  updater.attach(mainWindow);
  settingsService.get().then((s) => {
    if (s.autoUpdate) {
      setTimeout(() => updater.check(), 4000);
      setInterval(() => updater.check(), 1000 * 60 * 30);
    }
  });
```

(Remove the old direct `setTimeout`/`setInterval` lines for `updater.check()`.)

- [ ] **Step 2: Auto-launch on startup**

In `src/App.tsx`, after auth gate passes, trigger PLAY once if `autoLaunch` is set. Add:

```tsx
import { useSettingsStore } from './store/useSettingsStore';
import { useLauncherStore } from './store/useLauncherStore';

  const settings = useSettingsStore((s) => s.settings);
  const play = useLauncherStore((s) => s.play);

  useEffect(() => {
    if (accountStatus === 'authed' && settings?.autoLaunch) {
      play();
    }
    // run once when authed + settings loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountStatus, settings?.autoLaunch]);
```

- [ ] **Step 3: Pass resolution/fullscreen into launch**

In `electron/services/MinecraftService.ts`, extend `LaunchInput` and append window args. Add to the interface:

```ts
  width?: number;
  height?: number;
  fullscreen?: boolean;
```

In `launch`, after the quickPlay block, add:

```ts
    if (input.fullscreen) {
      gameArgs.push('--fullscreen');
    } else if (input.width && input.height) {
      gameArgs.push('--width', String(input.width), '--height', String(input.height));
    }
```

- [ ] **Step 4: Thread settings from LauncherService**

In `electron/services/LauncherService.ts`, read settings and pass window options. Add a `SettingsService` instance:

```ts
import { SettingsService } from './SettingsService';
  private readonly settings = new SettingsService();
```

In `runPipeline`, before `this.minecraft.launch({`, load settings:

```ts
    const cfg = await this.settings.get();
```

Add to the `minecraft.launch({ ... })` call:

```ts
      width: cfg.resolution.width,
      height: cfg.resolution.height,
      fullscreen: cfg.fullscreen,
      memory: cfg.memory,
```

(Replace the existing `memory: opts.memory` with `memory: cfg.memory` so the slider value is authoritative.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build:web`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts src/App.tsx electron/services/MinecraftService.ts electron/services/LauncherService.ts
git commit -m "feat(settings): apply autoUpdate/autoLaunch/resolution/fullscreen/memory"
git push origin main
```

---

## Task 8: Manual smoke

**No code changes** unless issues found.

- [ ] **Step 1:** `npm run dev`, open Settings → two tabs render.
- [ ] **Step 2:** RAM slider max equals system RAM; move it, reopen → persisted.
- [ ] **Step 3:** Java → Свой путь → pick a JRE → Проверить shows version.
- [ ] **Step 4:** Resolution preset + Своё persist.
- [ ] **Step 5:** Toggle auto-launch on, restart → game auto-starts after auth.
- [ ] **Step 6:** Reset → confirm → all controls back to defaults.

---

## Done criteria

- [ ] `npm test` — SettingsService passes.
- [ ] `npm run typecheck` — green.
- [ ] `npm run build:web` — green.
- [ ] Manual: both tabs work, settings persist and feed the launch.
