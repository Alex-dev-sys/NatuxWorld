<div align="center">

# ⛏️ NATUX WORLD Launcher

**Премиальный лаунчер для Minecraft-сервера [mc.vibestudy.ru](https://mc.vibestudy.ru)**

Один клик — и ты в игре. Forge 1.21.1, авто-вход на сервер, авто-обновления.

<br>

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-80%20passing-00FF7F)
![Version](https://img.shields.io/badge/version-1.7.3-FF2B4F)

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
| 🔄 **Авто-обновления** | `electron-updater` тянет новые версии с GitHub Releases |

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

## 🧱 Стек

**Electron 33** · **React 19** · **React Router 7** · **TypeScript (strict)** · **TailwindCSS 3** · **Framer Motion** · **Zustand** · **Vitest**

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

> ⚠️ Backend `vibestudy.ru/api/auth` пока не развёрнут — UI и экраны работают, сквозной E2E включится после публикации API.

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

`.github/workflows/build.yml` собирает Windows-инсталлятор на каждый push в `main` и каждый PR.

**Релиз с авто-публикацией .exe:**

```bash
# 1. Бамп версии в package.json
# 2. Коммит + пуш в main
git commit -am "release: vX.Y.Z" && git push
# 3. Тег → CI создаёт GitHub Release с .exe
git tag vX.Y.Z && git push origin vX.Y.Z
```

Собранный .exe без релиза: **GitHub → Actions → Build → Artifacts**.

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
