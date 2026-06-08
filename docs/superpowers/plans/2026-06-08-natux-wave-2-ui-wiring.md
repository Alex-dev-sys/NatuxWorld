# Wave 2 — UI Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all dead onClick handlers in the launcher UI, add inline expand on ServerInfo, build a profile dropdown with logout/rename, fix PlayButton progress flicker, and clean small state bugs. No new services.

**Architecture:** Each task touches one or two files and produces one commit. Where a component needs state, it stays component-local (`useState`) unless it crosses route boundaries (none in this wave). One new component is extracted (`ProfileMenu.tsx`) so the `TitleBar` stays under 100 lines.

**Tech Stack:** React 19, TypeScript strict, Zustand stores, framer-motion, lucide-react, Tailwind, react-router-dom (HashRouter), Electron 33.

**Testing approach:** No unit-test framework is installed. Each task verifies via `npm run typecheck` and manual smoke in `npm run dev`. Tests are introduced in Wave 3 alongside testgen plugin.

**Commit convention:** Per `CLAUDE.md`, do NOT add a `Co-Authored-By` trailer to any commit. Push directly to `main` after each commit (no branches, no PRs).

**Reference spec:** `docs/superpowers/specs/2026-06-08-natux-wave-2-ui-wiring-design.md`

## File map

| File | Change | Tasks |
|------|--------|-------|
| `src/components/NewsSection.tsx` | modify | T1 |
| `src/components/ServerInfo.tsx` | modify | T2 |
| `src/pages/StorePage.tsx` | modify | T3 |
| `src/components/ProfileMenu.tsx` | **create** | T4 |
| `src/components/TitleBar.tsx` | modify (T4 + T5) | T4, T5 |
| `src/components/Sidebar.tsx` | modify | T6 |
| `src/store/useLauncherStore.ts` | modify | T7 |
| `src/components/PlayButton.tsx` | modify (small) | T7 |
| `src/store/useSettingsStore.ts` | modify | T8 |

Each task ends with `git push origin main`.

---

## Task 1: Wire NewsSection «Все новости» button

**Files:**
- Modify: `src/components/NewsSection.tsx` (button at line 30)

- [ ] **Step 1: Add `useNavigate` import and call**

Edit `src/components/NewsSection.tsx`. Change the top import block from:

```tsx
import { useState } from 'react';
import { Newspaper, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNews } from '../hooks/useNews';
import { NewsCard } from './NewsCard';
import { NewsModal } from './NewsModal';
import type { NewsItem } from '../../electron/services/NewsService';
```

to:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNews } from '../hooks/useNews';
import { NewsCard } from './NewsCard';
import { NewsModal } from './NewsModal';
import type { NewsItem } from '../../electron/services/NewsService';
```

Inside the `NewsSection` function, after `const news = useNews();`, add:

```tsx
const navigate = useNavigate();
```

- [ ] **Step 2: Attach onClick to the button**

In the same file, change the existing button (currently no `onClick`):

```tsx
<button className="group flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary hover:text-primary-glow">
  Все новости
  <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
</button>
```

to:

```tsx
<button
  onClick={() => navigate('/news')}
  className="group flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary hover:text-primary-glow"
>
  Все новости
  <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
</button>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`
In the launched app, on the home page, click «Все новости». Expected: route changes to `#/news`, NewsPage renders.

- [ ] **Step 5: Commit & push**

```bash
git add src/components/NewsSection.tsx
git commit -m "feat(ui): wire NewsSection «Все новости» → /news"
git push origin main
```

---

## Task 2: ServerInfo — inline expandable panel

**Files:**
- Modify: `src/components/ServerInfo.tsx`

- [ ] **Step 1: Add state, icon import, and expanded content**

Replace the entire content of `src/components/ServerInfo.tsx` with:

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Copy, Check, ChevronDown, Lock, Unlock, Map as MapIcon, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useServerStatus } from '../hooks/useServerStatus';

export function ServerInfo() {
  const { status, info } = useServerStatus();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copyIp = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(info.ip);
    setCopied(true);
  };

  const rows: Array<[string, React.ReactNode]> = [
    [
      'IP адрес',
      <button
        key="ip"
        onClick={copyIp}
        className="group inline-flex items-center gap-1.5 text-white hover:text-primary transition"
      >
        <span className="font-mono text-sm">{info?.ip ?? 'mc.xbestu.ru'}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
        )}
      </button>,
    ],
    ['Режим', <span key="mode">{info?.mode ?? 'Анархия'}</span>],
    ['Версия', <span key="ver">{info?.version ?? '1.21.6 Forge'}</span>],
    [
      'TPS',
      <span key="tps" className="text-success">
        {status?.tps?.toFixed(1) ?? '20.0'} (отлично)
      </span>,
    ],
    [
      'Пинг',
      <span key="ping" className="text-success">
        {status?.ping ?? 52} мс
      </span>,
    ],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="relative flex flex-col gap-3 rounded-2xl glass p-4 shadow-premium"
    >
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-success/15 text-success">
          <Server className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
          Информация о сервере
        </span>
      </div>
      <div className="flex flex-col">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-center justify-between py-2 text-sm ${
              i < rows.length - 1 ? 'border-b border-white/[0.04]' : ''
            }`}
          >
            <span className="text-muted">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="extra"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 0.8, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              <ExtraRow icon={<MapIcon className="h-3.5 w-3.5" />} label="Карта" value={info?.map ?? 'world_anarchy'} />
              <ExtraRow icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Сложность" value={info?.difficulty ?? 'Hard'} />
              <ExtraRow
                icon={info?.whitelist ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                label="Whitelist"
                value={info?.whitelist ? 'Включён' : 'Выключен'}
              />
              <div className="mt-1 rounded-xl bg-white/[0.02] p-3 text-xs leading-relaxed text-muted ring-1 ring-white/[0.04]">
                Сервер NATUX WORLD. Анархия. Сезон 7. Гриф разрешён, PvP включён.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="group mt-1 flex items-center justify-center gap-1 rounded-xl bg-white/[0.03] py-2 text-[11px] font-semibold uppercase tracking-wider text-white/70 ring-1 ring-white/[0.05] hover:bg-white/[0.06] hover:text-white"
      >
        {expanded ? 'Свернуть' : 'Подробнее о сервере'}
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </motion.div>
  );
}

function ExtraRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-xs ring-1 ring-white/[0.04]">
      <span className="flex items-center gap-2 text-muted">
        <span className="text-primary/80">{icon}</span>
        {label}
      </span>
      <span className="font-medium text-white/90">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`. On the home page, click «Подробнее о сервере». Expected:
- Panel smoothly expands below the rows showing Карта / Сложность / Whitelist / описание.
- Chevron icon rotates 180°.
- Button label switches to «Свернуть».
- Click again collapses smoothly.

- [ ] **Step 4: Commit & push**

```bash
git add src/components/ServerInfo.tsx
git commit -m "feat(ui): inline expandable panel in ServerInfo with map/difficulty/whitelist"
git push origin main
```

---

## Task 3: StorePage «Купить» buttons — disabled + tooltip

**Files:**
- Modify: `src/pages/StorePage.tsx` (button at lines 36-41)

- [ ] **Step 1: Import Tooltip and update button**

Edit `src/pages/StorePage.tsx`. Add to imports:

```tsx
import { Tooltip } from '../components/ui/Tooltip';
```

Replace the existing button block (lines ~36-41):

```tsx
<button
  className="mt-4 w-full rounded-xl py-2 text-sm font-semibold ring-1 ring-white/10 hover:bg-white/[0.05]"
  style={{ color: item.color }}
>
  Купить
</button>
```

with:

```tsx
<Tooltip label="Скоро доступно">
  <button
    type="button"
    disabled
    aria-disabled="true"
    className="mt-4 w-full cursor-not-allowed rounded-xl py-2 text-sm font-semibold opacity-50 ring-1 ring-white/10"
    style={{ color: item.color }}
  >
    Купить
  </button>
</Tooltip>
```

- [ ] **Step 2: Verify Tooltip accepts a disabled child**

Open `src/components/ui/Tooltip.tsx` and confirm it wraps `children` with `pointer-events` handlers on the wrapper, not on the button itself. (If it puts handlers directly on the child via `cloneElement`, the disabled button will not fire mouseenter and tooltip won't show.)

If Tooltip uses cloneElement on child: instead of wrapping the button, wrap an outer `<span>` around the disabled button:

```tsx
<Tooltip label="Скоро доступно">
  <span className="inline-block w-full">
    <button ...>Купить</button>
  </span>
</Tooltip>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Navigate to `/store`. Expected:
- All four «Купить» buttons rendered at 50% opacity with not-allowed cursor.
- Hovering over each shows the «Скоро доступно» tooltip.
- Click does nothing.

- [ ] **Step 5: Commit & push**

```bash
git add src/pages/StorePage.tsx
git commit -m "feat(store): disable Купить buttons with Скоро tooltip (real flow in Wave 3)"
git push origin main
```

---

## Task 4: Create ProfileMenu component and wire into TitleBar

**Files:**
- Create: `src/components/ProfileMenu.tsx`
- Modify: `src/components/TitleBar.tsx`

- [ ] **Step 1: Create `src/components/ProfileMenu.tsx`**

Full file contents:

```tsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, LogOut, Pencil, User } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export function ProfileMenu() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  if (!user) {
    return (
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => login('Player_' + Math.floor(Math.random() * 9999))}
        className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.04] px-3 text-xs font-medium text-white/85 ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-colors"
      >
        <User className="h-3.5 w-3.5" />
        Войти
      </motion.button>
    );
  }

  const copyUuid = async () => {
    await navigator.clipboard.writeText(user.uuid);
    setCopied(true);
  };

  const submitRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === user.username) {
      setRenaming(false);
      return;
    }
    await logout();
    await login(trimmed);
    setRenaming(false);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.04] px-3 text-xs font-medium text-white/85 ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-colors"
      >
        <User className="h-3.5 w-3.5" />
        {user.username}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-[calc(100%+6px)] z-[70] w-64 overflow-hidden rounded-xl glass-strong shadow-premium ring-1 ring-white/[0.06]"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{user.username}</div>
                <div className="truncate text-[10px] font-mono text-muted">{user.uuid.slice(0, 18)}…</div>
              </div>
            </div>

            <div className="flex flex-col p-1">
              <button
                onClick={copyUuid}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Скопировано' : 'Копировать UUID'}
              </button>

              {renaming ? (
                <div className="flex items-center gap-1 px-1 py-1">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    placeholder="Новый ник"
                    className="flex-1 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-white ring-1 ring-white/10 focus:outline-none focus:ring-primary"
                  />
                  <button
                    onClick={submitRename}
                    className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primary-glow"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameDraft(user.username);
                    setRenaming(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Сменить ник
                </button>
              )}

              <button
                onClick={() => {
                  logout();
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-primary/10 hover:text-primary"
              >
                <LogOut className="h-3.5 w-3.5" />
                Выйти
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Replace the inline profile button in TitleBar.tsx**

Edit `src/components/TitleBar.tsx`. Update imports — remove `motion` if unused elsewhere (keep it; the file uses it). Add:

```tsx
import { ProfileMenu } from './ProfileMenu';
```

Remove the inline `<motion.button>...{user ? user.username : 'Войти'}...</motion.button>` block (currently lines ~34-42) and replace with:

```tsx
<ProfileMenu />
```

Then clean up imports and locals that became unused — `noUnusedLocals` is enabled in `tsconfig.app.json`, so any stale binding will fail typecheck:

- Remove `useAuthStore` import.
- Remove the `const user = useAuthStore((s) => s.user);` and `const login = useAuthStore((s) => s.login);` lines.
- Remove `User` from the `lucide-react` import (now used only inside `ProfileMenu`).
- Remove `motion` from the `framer-motion` import IF no other `motion.*` element remains in `TitleBar`. Verify by searching the file for `motion.` — if only the deleted block used it, drop the import.

Keep the existing `<Tooltip label="Настройки">` block and window control buttons untouched.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Expected:
- If logged out (after fresh launch): header shows «Войти» button. Click → random `Player_NNNN` appears (existing behavior preserved).
- Click on the username → dropdown opens with UUID slice, «Копировать UUID», «Сменить ник», «Выйти».
- Click «Копировать UUID» → check icon, then back to copy icon.
- Click «Сменить ник» → input appears, type new name, press Enter → username updates.
- Click «Выйти» → menu closes, header reverts to «Войти».
- Click outside the dropdown → closes.

- [ ] **Step 5: Commit & push**

```bash
git add src/components/ProfileMenu.tsx src/components/TitleBar.tsx
git commit -m "feat(ui): profile dropdown with copy UUID / rename / logout"
git push origin main
```

---

## Task 5: TitleBar — IP copy toast (check icon swap)

**Files:**
- Modify: `src/components/TitleBar.tsx`

- [ ] **Step 1: Add state and effect in TitleBar**

Edit `src/components/TitleBar.tsx`. Add to imports (if not already present):

```tsx
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
```

Inside the `TitleBar` function, after existing hook calls, add:

```tsx
const [ipCopied, setIpCopied] = useState(false);
useEffect(() => {
  if (!ipCopied) return;
  const t = setTimeout(() => setIpCopied(false), 1600);
  return () => clearTimeout(t);
}, [ipCopied]);
```

- [ ] **Step 2: Update the copy button to swap icon**

Find the existing copy button (currently `<button onClick={() => navigator.clipboard.writeText('mc.xbestu.ru')} ...><Copy className="h-3 w-3" /></button>`) and replace with:

```tsx
<button
  onClick={async () => {
    await navigator.clipboard.writeText('mc.xbestu.ru');
    setIpCopied(true);
  }}
  className="ml-1 text-muted hover:text-white"
  title="Скопировать IP"
>
  {ipCopied ? (
    <Check className="h-3 w-3 text-success" />
  ) : (
    <Copy className="h-3 w-3" />
  )}
</button>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Click the copy icon next to `mc.xbestu.ru` in the title bar. Expected: icon swaps to a green check, holds ~1.6s, then reverts to copy icon. Clipboard contains `mc.xbestu.ru`.

- [ ] **Step 5: Commit & push**

```bash
git add src/components/TitleBar.tsx
git commit -m "feat(titlebar): visual feedback (check icon) on IP copy"
git push origin main
```

---

## Task 6: Sidebar — remove fabricated stats

**Files:**
- Modify: `src/components/Sidebar.tsx` (the three SidebarStat blocks at lines 65-87)

- [ ] **Step 1: Remove unused imports and trim stats block**

Edit `src/components/Sidebar.tsx`. In the `lucide-react` import line, remove `UserPlus` and `Gauge` and `Activity` if they are only used by the removed stats (keep them if other parts of the file use them — verify before deleting).

Replace the three-stat block (the entire `<motion.div ...> <SidebarStat .../> <SidebarStat .../> <SidebarStat .../> </motion.div>` containing «567 регистраций» and «TPS» and «онлайн»):

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
  className="flex flex-col gap-2"
>
  <SidebarStat
    icon={<span className="relative grid h-7 w-7 place-items-center rounded-lg bg-success/10">
      <span className="absolute h-2 w-2 rounded-full bg-success animate-ping-ring" />
      <span className="relative h-2 w-2 rounded-full bg-success shadow-[0_0_8px_rgba(0,255,127,0.9)]" />
    </span>}
    value={`${status?.players ?? 142} онлайн`}
    sub={`Сейчас на сервере`}
  />
  <SidebarStat
    icon={<div className="grid h-7 w-7 place-items-center rounded-lg bg-warning/10 text-warning">
      <UserPlus className="h-3.5 w-3.5" />
    </div>}
    value="567 регистраций"
    sub="Сегодня"
  />
  <SidebarStat
    icon={<div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
      <Gauge className="h-3.5 w-3.5" />
    </div>}
    value={`TPS: ${status?.tps?.toFixed(1) ?? '20.0'}`}
    sub="Состояние сервера: Отличное"
    right={<Activity className="h-3.5 w-3.5 text-success" />}
  />
</motion.div>
```

With this (keep only online + TPS, both data-driven; drop fake registrations; rewrite online sub):

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
  className="flex flex-col gap-2"
>
  <SidebarStat
    icon={<span className="relative grid h-7 w-7 place-items-center rounded-lg bg-success/10">
      <span className="absolute h-2 w-2 rounded-full bg-success animate-ping-ring" />
      <span className="relative h-2 w-2 rounded-full bg-success shadow-[0_0_8px_rgba(0,255,127,0.9)]" />
    </span>}
    value={`${status?.players ?? 142} онлайн`}
    sub="Сейчас на сервере"
  />
  <SidebarStat
    icon={<div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
      <Gauge className="h-3.5 w-3.5" />
    </div>}
    value={`TPS: ${status?.tps?.toFixed(1) ?? '20.0'}`}
    sub="Состояние сервера: Отличное"
    right={<Activity className="h-3.5 w-3.5 text-success" />}
  />
</motion.div>
```

Then in the imports list, remove `UserPlus` since it is no longer used in this file. Keep `Gauge` and `Activity`.

- [ ] **Step 2: Typecheck (catches unused-import error)**

Run: `npm run typecheck`
Expected: zero errors. If TS complains about `UserPlus` being declared but never used, that confirms the import removal was needed — re-verify the import line.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`. Sidebar shows exactly two stat rows: «N онлайн / Сейчас на сервере» and «TPS: 20.0 / Состояние сервера: Отличное». The fabricated «567 регистраций / Сегодня» is gone.

- [ ] **Step 4: Commit & push**

```bash
git add src/components/Sidebar.tsx
git commit -m "chore(sidebar): drop fabricated registrations stat, rewrite online sub-line"
git push origin main
```

---

## Task 7: PlayButton progress flicker fix + try/catch in store

**Files:**
- Modify: `src/store/useLauncherStore.ts`

- [ ] **Step 1: Replace the `play` action**

Edit `src/store/useLauncherStore.ts`. Replace the existing `play: async () => { ... }` action with:

```ts
play: async () => {
  const { selectedVersion, isLaunching } = get();
  if (isLaunching) return;
  set({ isLaunching: true, progress: 5, progressMessage: 'Подготовка окружения...' });

  try {
    await bridge.launcher.play({
      version: selectedVersion.id,
      loader: selectedVersion.loader as LoaderKind,
      username: 'Player',
      memory: 4096,
    });
  } catch {
    set({ isLaunching: false, progress: 0, progressMessage: 'Ошибка запуска' });
    return;
  }

  let p = 5;
  const interval = setInterval(() => {
    p += Math.random() * 10;
    if (p >= 100) {
      clearInterval(interval);
      set({ progress: 100, progressMessage: 'Запуск Minecraft...' });
      setTimeout(() => set({ isLaunching: false, progress: 0, progressMessage: 'Готов к запуску' }), 800);
    } else {
      set({
        progress: Math.round(p),
        progressMessage: p < 50 ? 'Загрузка ассетов...' : 'Проверка библиотек...',
      });
    }
  }, 220);
},
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`. Click PLAY. Expected:
- Bar fills smoothly to 100%.
- Holds visibly at 100% for ~800ms with «Запуск Minecraft...» caption.
- Then resets: button reverts to «ИГРАТЬ» and progress bar disappears.
- No visible flicker at the transition.

- [ ] **Step 4: Commit & push**

```bash
git add src/store/useLauncherStore.ts
git commit -m "fix(launcher): hold progress at 100% before reset; catch play errors"
git push origin main
```

---

## Task 8: useSettingsStore — drop redundant second `set`

**Files:**
- Modify: `src/store/useSettingsStore.ts`

- [ ] **Step 1: Simplify `update`**

Edit `src/store/useSettingsStore.ts`. Replace the existing `update` action:

```ts
update: async (patch) => {
  const next = await bridge.settings.set(patch);
  set({ settings: next });
  const current = get().settings;
  if (current) set({ settings: { ...current, ...patch } });
},
```

with:

```ts
update: async (patch) => {
  const next = await bridge.settings.set(patch);
  set({ settings: next });
},
```

`get` may then become unused — if TypeScript flags it, change the store factory signature `(set, get) => ({ ... })` to `(set) => ({ ... })`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`. Open Settings (gear icon in title bar). Change Memory to e.g. 6144, toggle fullscreen, type into JVM args. Close and reopen — values persist (settings file is on disk). No regression.

- [ ] **Step 4: Commit & push**

```bash
git add src/store/useSettingsStore.ts
git commit -m "chore(store): drop redundant second set in useSettingsStore.update"
git push origin main
```

---

## Wave 2 done

After Task 8, run one final verification:

- [ ] `npm run typecheck` — zero errors.
- [ ] `npm run build:web` — succeeds.
- [ ] All eight commits visible in `git log --oneline -10`, all on `main`, all pushed to `origin/main`.
- [ ] Manually sanity-check the dev app: every Wave 2 acceptance criterion in the spec passes.

If anything fails, do NOT amend the prior commit. Fix forward with a new commit.
