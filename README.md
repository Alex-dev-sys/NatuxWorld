<div align="center">

# ⛏️ NATUX WORLD Launcher

**Премиальный лаунчер для Minecraft-сервера [mc.vibestudy.ru](https://mc.vibestudy.ru)**

Один клик — и ты в игре. Forge 1.21.1, авто-вход на сервер, авто-обновления.

<br>

![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Version](https://img.shields.io/badge/version-1.9.8-FF2B4F)

</div>

---

## ✨ Что умеет

| | |
|---|---|
| 🎮 **Одна кнопка ИГРАТЬ** | Качает Minecraft + Forge 1.21.1, ставит, запускает и сразу коннектит на сервер (`quickPlayMultiplayer`) |
| 🔥 **Forge из коробки** | Headless-установщик Forge с проверкой целостности zip и авто-восстановлением при повреждении |
| 👤 **Аккаунты** | Регистрация + подтверждение по e-mail + вход через `vibestudy.ru`. Ник аккаунта = ник в игре |
| ⚙️ **Гибкие настройки** | Две вкладки **Игра** / **Лаунчер**: память (с привязкой к ОЗУ системы), выбор Java, разрешение, fullscreen, JVM-аргументы, авто-апдейт, автозапуск |
| 📜 **Логи в реальном времени** | Поток логов установки и игры с батчингом, чтобы UI не фризил при загрузке |
| 🔄 **Безопасные обновления** | Windows автоматически загружает только обновления с корректной Ed25519-подписью; macOS остаётся ручной до notarization |

---

## 🚀 Быстрый старт

```bash
npm install
npm run dev          # Vite + Electron в dev-режиме
```

| Скрипт | Что делает |
|--------|-----------|
| `npm run dev` | Запуск в режиме разработки (hot reload) |
| `npm run build` | Полная сборка + упаковка инсталлятора (`electron-builder`) |
| `npm run build:web` | Только рендерер (`tsc -b && vite build`) |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Прогон тестов (Vitest) |
| `npm run lint` | ESLint |

---

## 🍎 Запуск на macOS

Сборка `.dmg` **не подписана** сертификатом Apple (`CSC_IDENTITY_AUTO_DISCOVERY: false`), поэтому при первом запуске Gatekeeper её блокирует. Это ожидаемо.

1. Скачай `.dmg` из [Releases](https://github.com/Alex-dev-sys/NatuxWorld/releases), открой и перетащи **NATUX WORLD** в **Applications**.
2. **Самый лёгкий способ** — вставь в Терминал одну команду и всё заработает:

```bash
xattr -cr "/Applications/NATUX WORLD.app"
```

3. Запусти **NATUX WORLD** как обычно.

После этого нужен только интернет — при первом нажатии **ИГРАТЬ** лаунчер сам докачает Java 21, Minecraft и Forge.

<details>
<summary>Альтернатива без терминала</summary>

Правый клик (или Ctrl + клик) по иконке **NATUX WORLD** в Applications → **Открыть** → в диалоге ещё раз **Открыть**. Работает, если macOS не пишет «приложение повреждено» — в этом случае используй команду выше.
</details>

> ⚠️ Windows проверяет отдельную Ed25519-подпись манифеста и SHA-512 установщика перед загрузкой. Это защищает канал обновления бесплатно, но не убирает предупреждение SmartScreen. На macOS обновление остаётся ручным до Developer ID/notarization.

---

## 🪟 Запуск на Windows

Установщик `.exe` **не подписан** code-signing сертификатом, поэтому при запуске Microsoft Defender SmartScreen показывает синее окно **«Система Windows защитила ваш компьютер»**. Это не вирус и не ошибка — так Windows реагирует на любой неподписанный установщик от нового издателя.

1. Скачай `NATUX WORLD-Setup-*.exe` из [Releases](https://github.com/Alex-dev-sys/NatuxWorld/releases).
2. Запусти. В окне SmartScreen нажми **«Подробнее»**, затем появившуюся кнопку **«Выполнить в любом случае»**.
3. Установка идёт **без прав администратора** (per-user), UAC не спрашивает пароль.

> 💡 Хочешь убедиться, что скачал настоящий файл, а не подделку? Проверь контрольную сумму — см. [docs/INSTALL.md](docs/INSTALL.md#проверка-целостности). К каждому релизу прикладывается `SHA256SUMS-windows.txt`.

Полный гайд по установке (Windows + macOS, с обходом предупреждений и проверкой целостности) — **[docs/INSTALL.md](docs/INSTALL.md)**.

---

## 🧱 Стек

**Electron 43** · **React 19** · **React Router 7** · **TypeScript (strict)** · **TailwindCSS 3** · **Framer Motion** · **Zustand** · **Vitest**

---

## 🗂️ Структура

```
NatuxWorld/
├── electron/                     # Main-процесс
│   ├── main.ts                   # Точка входа, окно, авто-апдейт (гейтится autoUpdate)
│   ├── preload.ts                # Context-isolated мост → window.natux
│   ├── ipc/
│   │   ├── channels.ts           # Константы IPC-каналов
│   │   └── handlers.ts           # Регистрация хендлеров + синглтоны сервисов
│   └── services/
│       ├── LauncherService.ts    # Оркестр: пайплайн скачать→Forge→запуск
│       ├── MinecraftService.ts   # Сборка аргументов запуска JVM/игры
│       ├── ForgeService.ts       # Установка Forge, merge версий, валидация zip
│       ├── JavaService.ts        # Поиск/проверка Java 21+
│       ├── AccountService.ts     # 🆕 HTTPS к vibestudy.ru/api/auth + токен в account.json
│       ├── AuthService.ts        # Offline-идентичность MC
│       ├── SettingsService.ts    # settings.json: память, Java, разрешение, авто-флаги
│       ├── UpdateService.ts      # electron-updater
│       ├── DownloadService.ts    # Загрузка с прогрессом
│       ├── MojangService.ts      # Манифесты Mojang
│       └── NewsService.ts
├── src/                          # Renderer (React)
│   ├── App.tsx                   # AuthGate гейтит лаунчер до входа
│   ├── components/
│   │   ├── auth/                 # 🆕 LoginScreen, RegisterScreen, VerifyEmailScreen, AuthGate
│   │   ├── SettingsModal.tsx     # Вкладки Игра / Лаунчер
│   │   ├── PlayButton.tsx
│   │   ├── Sidebar.tsx · TitleBar.tsx · ProfileMenu.tsx · StatCard.tsx ...
│   │   └── ui/                   # GlassCard, Button, Tooltip, Spinner
│   ├── store/                    # Zustand: useLauncherStore, useAccountStore, useSettingsStore, useAuthStore
│   ├── lib/validators.ts         # 🆕 Валидаторы ника/email/пароля/кода
│   ├── services/electron-bridge.ts # Web-fallback всех IPC API
│   ├── pages/ · hooks/ · types/ · utils/
│   └── data/news.json
└── docs/superpowers/             # Спеки и планы фич (specs/ + plans/)
```

---

## 🎨 Дизайн

> **Dark Cyber Fantasy** — стекло, премиум-тени, красное амбиентное свечение.

| Токен | Цвет |
|-------|------|
| Фон | `#070707` |
| Карточка | `#0F1117` / `#141821` |
| Акцент | `#FF2B4F` · свечение `#FF0037` |
| Discord / Success / Warning | `#5865F2` · `#00FF7F` · `#FF8A00` |

Кнопки — Framer Motion spring + glow. Кнопка ИГРАТЬ пульсирует красным градиентом с shimmer-оверлеем.

---

## 🔐 Аккаунты (auth)

Лаунчер закрыт `AuthGate` до входа. Поток:

```
Регистрация ──▶ Код на e-mail ──▶ Подтверждение ──▶ Лаунчер
   Вход ───────────────────────────────────────────▶ Лаунчер
```

- `AccountService` (main) ходит на `https://vibestudy.ru/api/auth/*`, хранит JWT в `account.json`.
- При старте `bootstrap()` проверяет токен через `/me` — валиден → сразу в лаунчер.
- Ник аккаунта подставляется как offline-ник Minecraft при запуске.

> Auth-запросы идут на `vibestudy.ru/api/auth` и `vibestudy.ru/api/yggdrasil` — эти эндпоинты реализованы в натуральном виде в репо `natux-world`.

---

## 📦 Сборка инсталляторов

### Локально (Windows)

```bash
npm install
npm run build
# release/:
#   NATUX WORLD-Setup-<ver>-x64.exe      (NSIS installer)
#   NATUX WORLD-Portable-<ver>-x64.exe   (portable)
```

### GitHub Actions

`.github/workflows/build.yml`:

- **Pull request в `main`** — typecheck + тесты + сборка (без публикации и без тега). CI красный, если тесты падают.
- **Push в `main`** — то же самое, плюс авто-релиз, если версия в `package.json` ещё не тегирована.

**Релиз управляется версией в `package.json` — теги вручную ставить НЕ нужно.**

```bash
# 1. Бамп версии в package.json (например, 1.8.3 → 1.8.4)
# 2. Коммит + пуш в main
git commit -am "release: v1.8.4" && git push
```

Дальше CI сам:

1. Прогоняет `typecheck` + `test` (релиз падает, если тесты красные).
2. Собирает и публикует `.exe` / `.dmg` в GitHub Release через `electron-builder --publish always`.
3. Подписывает Windows update-манифест секретом `UPDATE_SIGNING_PRIVATE_KEY` и публикует подпись в Release.
4. **Только после успешной публикации** создаёт и пушит тег `vX.Y.Z`.

Закрытый Ed25519-ключ хранится только в GitHub Actions secret `UPDATE_SIGNING_PRIVATE_KEY`; в приложение встроен лишь публичный ключ. При утрате закрытого ключа автоматические Windows-обновления необходимо перевести на новую пару ключей отдельным релизом.

Порядок «тег после публикации» защищает от бага v1.8.0, когда упавшая публикация оставляла тег и все повторные запуски считали версию уже выпущенной (`release=false`).

Собранный .exe без релиза (например, из PR): **GitHub → Actions → Build → Artifacts**.

### Иконки

Положи `icon.ico` / `icon.icns` / `icon.png` в `build/`. Без них — дефолтная иконка Electron.

---

## 🧩 Архитектурные заметки

- **Preload-мост**: `window.natux` отдаёт типизированные API (`launcher`, `account`, `auth`, `java`, `news`, `server`, `settings`, `updater`, `window`, `shell`, `app`).
- **Web-fallback**: в чистом Vite (без Electron) тот же набор API замокан в `electron-bridge.ts` — UI крутится в браузере идентично.
- **IPC-каналы**: централизованные константы в `electron/ipc/channels.ts`.
- **Сервисы**: каждая забота (Minecraft / Forge / Java / Account / Update) — отдельный класс в `electron/services/`.

---

<div align="center">
<sub>NATUX WORLD · сделано для <a href="https://mc.vibestudy.ru">mc.vibestudy.ru</a></sub>
</div>
