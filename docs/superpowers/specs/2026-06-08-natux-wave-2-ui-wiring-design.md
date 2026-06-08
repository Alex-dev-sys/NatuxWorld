# Wave 2 — Dead Buttons & UX Wiring

**Date:** 2026-06-08
**Scope:** Wire all visible UI affordances that currently do nothing on click, fix the PlayButton progress flicker, and clean up a few small state-management bugs the audit surfaced. No new services, no API changes.

## Context

Wave 1 (infra) is complete — preload loads reliably, window controls work, build emits `preload.mjs` deterministically, electron-builder config is unified, `news.json` fallback exists. Wave 2 takes the existing UI surface and makes it feel finished within the bounds of what current data allows.

Real backends (launcher pipeline, MS auth with persistence, server ping, donate platform integration, content from vibestudy.ru) remain Wave 3.

## Items

### W1. NewsSection «Все новости» button

**File:** `src/components/NewsSection.tsx:30`

Currently a styled `<button>` with no `onClick`. Wire it to `useNavigate()('/news')` so it lands on the dedicated news page that already exists at `src/pages/NewsPage.tsx`.

### W2. ServerInfo «Подробнее о сервере» — inline expandable

**File:** `src/components/ServerInfo.tsx:82-85`

User decision: inline expand, not a new route. The `info` object already has fields the basic view doesn't surface (`map`, `difficulty`, `whitelist`). Add:

- Local `useState` for `expanded`.
- Click toggles `expanded`.
- Below the existing rows, a `framer-motion` `<motion.div>` with `initial/animate height` (or `AnimatePresence` with collapse). Shows the extra fields: Карта, Сложность, Whitelist, плюс block с MOTD-placeholder ("Сервер NATUX WORLD. Анархия. Сезон 7.") — real MOTD comes in Wave 3.
- Chevron icon on the button rotates 180° when expanded.
- Button label switches: «Подробнее о сервере» ↔ «Свернуть».

### W3. StorePage «Купить» buttons

**File:** `src/pages/StorePage.tsx:36-41`

User decision: defer real purchase flow to Wave 3. For Wave 2:

- `disabled` state with reduced opacity.
- Wrap each button in the existing `<Tooltip label="Скоро доступно">` from `src/components/ui/Tooltip.tsx`.
- Click is a no-op (button is actually `disabled`, so the click handler can be omitted).

No new state, no new components.

### W4. TitleBar profile dropdown

**File:** `src/components/TitleBar.tsx:34-42`

Replace the current «if user clicked-but-already-logged-in → null» antipattern. Build a small dropdown:

- Closed state: shows current behavior (login if anonymous, name+icon if logged in).
- Open state (only when logged in): dropdown panel with:
  - User row: avatar (placeholder icon), username, truncated UUID.
  - «Копировать UUID» — uses `navigator.clipboard.writeText(user.uuid)`. Toast pattern same as W5.
  - «Сменить ник» — opens a tiny inline prompt (input + save/cancel). On save: `logout()` then `login(newName)` so the auth flow re-fires.
  - «Выйти» — calls `logout()` from `useAuthStore`.
- Click-outside closes the dropdown (use `useRef` + `mousedown` listener, mirroring `VersionSelector.tsx:11-18`).
- Framer Motion enter/exit, matching `VersionSelector` aesthetic for consistency.

Component file: `src/components/ProfileMenu.tsx` (new, extracted out of TitleBar to keep TitleBar lean).

### W5. TitleBar IP-copy toast

**File:** `src/components/TitleBar.tsx:23-29`

Current code silently writes to clipboard with zero feedback. Match the pattern from `ServerInfo.tsx:30-36`: swap the `Copy` icon for `Check` (success color) for ~1.6s after click. Local `useState` + `useEffect` timeout. No new global toast component.

### W6. Sidebar — remove fake stats

**File:** `src/components/Sidebar.tsx:64-88`

Two of the three stats are fabricated (`567 регистраций · Сегодня`, `Пик игроков сегодня в 12:45`). Real stats are not in Wave 2 scope. Remove the two fabricated `<SidebarStat>` blocks. Keep the third (TPS) — it reads from `useServerStatus()`. Also rewrite the «online» sub-line: instead of `Пик игроков сегодня в 12:45`, use `Сейчас на сервере` so it doesn't claim data we don't have.

### F1. PlayButton progress flicker

**Files:** `src/components/PlayButton.tsx`, `src/store/useLauncherStore.ts`

Currently when fake progress reaches 100% the store immediately flips `isLaunching: false` — the green bar never visibly fills, the button text snaps back. Fix in `useLauncherStore.play`:

```ts
if (p >= 100) {
  clearInterval(interval);
  set({ progress: 100, progressMessage: 'Запуск Minecraft...' });
  setTimeout(() => set({ isLaunching: false, progress: 0 }), 800);
}
```

The 800ms hold gives the bar time to render at 100%, then resets state.

Also wrap `bridge.launcher.play(...)` in a `try/catch`:

```ts
try {
  await bridge.launcher.play({ ... });
} catch (err) {
  set({ isLaunching: false, progress: 0, progressMessage: 'Ошибка запуска' });
  return;
}
```

Without this, an exception leaves the store stuck in `isLaunching: true` forever.

### F2. `useSettingsStore.update` double-set

**File:** `src/store/useSettingsStore.ts:23-28`

Current code:

```ts
update: async (patch) => {
  const next = await bridge.settings.set(patch);
  set({ settings: next });
  const current = get().settings;
  if (current) set({ settings: { ...current, ...patch } });
}
```

The second `set` overwrites the freshly-applied `next` with a spread that re-applies `patch` on top of itself — redundant at best, race-prone at worst. Reduce to one `set`:

```ts
update: async (patch) => {
  const next = await bridge.settings.set(patch);
  set({ settings: next });
}
```

### F3. Already covered by F1's try/catch.

## Out of scope

- Real launcher pipeline (Minecraft download, JVM spawn) — Wave 3.
- Real MS auth and token persistence — Wave 3.
- Real server ping / MOTD / players-now — Wave 3.
- Real donate platform integration — Wave 3.
- Replacing fabricated registrations/peak stats with real API — Wave 3.
- Real news source (vibestudy.ru) — Wave 3.

## Testing

No test framework is installed yet (testgen plugin available but not used this wave). Verification is manual smoke plus typecheck:

1. `npm run typecheck` — zero errors.
2. `npm run build:web` — succeeds.
3. `npm run dev` — manual checks:
   - Click «Все новости» → lands on `/news`.
   - Click «Подробнее о сервере» → panel expands smoothly, chevron rotates, click again collapses.
   - Hover «Купить» on each tier → tooltip «Скоро доступно» appears, button does not respond to click.
   - Login (random name) → click name in header → dropdown opens with UUID/Copy UUID/Сменить ник/Выйти. «Выйти» reverts to «Войти» button.
   - Click Copy on IP in title bar → icon swaps to Check for ~1.6s.
   - Sidebar shows only 1 stat (TPS), no fabricated registration/peak lines.
   - Click PLAY → progress bar fills smoothly to 100%, holds briefly, then state resets cleanly.

## Acceptance criteria

1. All onClick handlers wired or explicitly disabled-with-tooltip; no silently-dead buttons remain in Wave 2 components.
2. Profile dropdown opens, closes on outside-click, supports logout and rename.
3. PlayButton progress visibly reaches 100% before resetting.
4. `useSettingsStore.update` no longer contains the redundant second `set`.
5. Sidebar shows no fabricated numbers.
6. typecheck + build:web are green.

## Risks

- **Inline expand animation jank:** if `framer-motion` height animation flickers on initial render, fall back to `AnimatePresence` with a CSS-grid `1fr/0fr` collapse trick (more robust on Windows).
- **Click-outside in dropdown:** must not also close when clicking inside the «Сменить ник» input. Tested via `e.target` check against ref subtree.
- **Tooltip stacking:** existing Tooltip component uses absolute positioning — on disabled buttons the click target still receives `mouseenter`. Verify in dev.
