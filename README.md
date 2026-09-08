<div align="center">

<img src="public/icon.png" width="110" alt="NATUX WORLD" />

# NATUX WORLD

### Готовая экосистема Minecraft-сервера: лаунчер, сайт с донат-магазином и серверный плагин

**Игрок скачивает один `.exe`, жмёт одну кнопку — и через минуту он на сервере.**<br/>
Покупает ранг — привилегии выдаются сами, без администратора.

<br/>

<a href="README.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-FF2B4F?style=for-the-badge&labelColor=0F1117" alt="Русский" /></a>
<a href="README.en.md"><img src="https://img.shields.io/badge/English-2A2E38?style=for-the-badge&labelColor=0F1117" alt="English" /></a>

<br/><br/>

![Electron](https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma_7-336791?style=flat-square&logo=postgresql&logoColor=white)
![Paper](https://img.shields.io/badge/Paper-1.21.1-EEEEEE?style=flat-square)
<br/>
![Tests](https://img.shields.io/badge/%D1%82%D0%B5%D1%81%D1%82%D1%8B-273%20%E2%9C%93-00C853?style=flat-square)
![Version](https://img.shields.io/badge/%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F-1.9.15-FF2B4F?style=flat-square)
![Audit](https://img.shields.io/badge/%D0%B0%D1%83%D0%B4%D0%B8%D1%82-0%20%D0%BA%D1%80%D0%B8%D1%82%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D1%85-00C853?style=flat-square)

</div>

---

> ### 💼 Проект продаётся целиком
>
> Два репозитория, домен, инфраструктура и вся документация передаются одному владельцу.
> Честный чек-лист доступов, production-проверок и ограничений — **[docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md)**.

---

## 🎯 Что это на самом деле

Обычный Minecraft-проект — это форум на движке 2010 года, донат через личку админа и «скачай архив, распакуй в `.minecraft`». Игроки отваливаются на каждом шаге, а владелец руками выдаёт привилегии.

**NATUX WORLD убирает всю эту цепочку.**

<table>
<tr>
<td width="33%" valign="top">

### 🚀 Лаунчер
Windows и macOS. Сам ставит Java 21, Minecraft и Forge 1.21.1, подключает к серверу **одним кликом**. Обновляется по воздуху с криптографической подписью.

</td>
<td width="33%" valign="top">

### 🌐 Сайт + API
Next.js 14 и PostgreSQL. Аккаунты с 2FA, **собственный Yggdrasil-authserver**, донат-магазин, приём платежей, админ-панель с RCON-консолью.

</td>
<td width="33%" valign="top">

### 🧩 Плагин
Paper 1.21. Собирает игровые события, античит-базлайн, отдаёт статистику в лидерборд сайта.

</td>
</tr>
</table>

Три части написаны как **одна система**: аккаунт с сайта — это логин в лаунчере, он же ник в игре, он же покупатель в магазине, он же строка в лидерборде. Ничего не нужно связывать вручную.

---

## 📊 Что внутри — в цифрах

<div align="center">

| | | | |
|:--|--:|:--|--:|
| **Строк кода** | `27 704` | **Автотестов** | `273` ✅ |
| **API-эндпоинтов** | `65` | **Тестовых файлов** | `58` |
| **React-компонентов** | `59` | **Моделей БД** | `15` |
| **Сервисов лаунчера** | `19` | **Миграций Prisma** | `21` |

</div>

> Проверено на текущем коммите: `npm test` — **106/106** в лаунчере и **167/167** на сайте, обе сюиты зелёные за 7 секунд.
> Это не «тесты для галочки»: `DownloadService` поднимает настоящий HTTP-сервер и проверяет отказ при несовпадении SHA-1.

---

## ⚡ Как это работает

```mermaid
flowchart LR
    P(["Игрок"]) --> L["Лаунчер"]
    L -->|"регистрация, код на e-mail"| S["Сайт / API"]
    S -->|"JWT"| L
    L -->|"Java 21, Minecraft, Forge"| MC[("Minecraft-сервер")]
    L -->|"quickPlayMultiplayer"| MC
    MC --- PL["Плагин"]
    PL -->|"события, онлайн, античит"| S
    P -->|"покупка ранга"| SHOP["Магазин"]
    SHOP --> PAY{{"ЮKassa · YooMoney · CryptoBot"}}
    PAY -->|"webhook"| S
    S -->|"RCON, LuckPerms"| MC
```

Полный путь игрока — от скачивания до выданного ранга — **не требует ни одного действия администратора**.

---

## 🚀 Лаунчер

| | |
|---|---|
| 🎮 **Одна кнопка** | Качает Minecraft + Forge 1.21.1, ставит и сразу коннектит на сервер через `quickPlayMultiplayer` |
| ☕ **Java из коробки** | Ищет Java 21+ в системе, при отсутствии — скачивает и ставит сам |
| 🔥 **Headless Forge** | Установка без единого диалога, проверка целостности zip и авто-восстановление при повреждении |
| 👤 **Аккаунты** | Регистрация → код на e-mail → вход. Ник аккаунта = ник в игре, подмена невозможна |
| ⚙️ **Настройки** | Память (с привязкой к ОЗУ системы), выбор Java, разрешение, fullscreen, JVM-аргументы, автозапуск |
| 📜 **Логи в реальном времени** | Поток установки и игры с батчингом — UI не фризит даже на тяжёлой загрузке |
| 🩺 **Диагностика** | Встроенная проверка окружения одной кнопкой и автоотправка crash-репортов |
| ⏱️ **Игровое время** | Учёт наигранных часов с корректной обработкой аварийного выхода |
| 💬 **Discord Rich Presence** | Статус «играет на сервере» — включается одним ID в конфиге |
| 🔄 **Подписанные обновления** | Перед скачиванием проверяются **Ed25519-подпись манифеста**, версия, имя файла и SHA-512 |

<details>
<summary><b>Дизайн: Dark Cyber Fantasy</b></summary>

<br/>

Стекло, премиум-тени, красное амбиентное свечение. Кнопки на Framer Motion spring + glow; кнопка **ИГРАТЬ** пульсирует красным градиентом с shimmer-оверлеем.

| Токен | Цвет |
|-------|------|
| Фон | `#070707` |
| Карточка | `#0F1117` · `#141821` |
| Акцент | `#FF2B4F` · свечение `#FF0037` |
| Discord · Success · Warning | `#5865F2` · `#00FF7F` · `#FF8A00` |

</details>

---

## 🌐 Сайт, API и админ-панель

| | |
|---|---|
| 🛒 **Донат-магазин** | 7 рангов × 3 срока (30 дней / 90 дней / навсегда), промокоды со скидками |
| 💳 **Три платёжки** | ЮKassa (карты, СБП), YooMoney, CryptoBot (крипта). Режим `multi` — все сразу |
| ✅ **Автовыдача** | RCON → LuckPerms сразу после оплаты, 3 попытки, идемпотентность против двойной выдачи |
| 🔑 **Yggdrasil authserver** | Собственный auth для Minecraft вместо Mojang: `authenticate`, `refresh`, `validate`, `invalidate`, `join`, `hasJoined` |
| 🔐 **2FA всерьёз** | TOTP с QR-кодом, e-mail-коды, резервные коды, app-passwords для интеграций |
| 🛡️ **Админ-панель** | Заказы, возвраты, повтор выдачи, пользователи, баны, whitelist, RCON-консоль, промокоды, статистика, audit log, crash-репорты |
| 🏆 **Лидерборд** | Рейтинг игроков по данным плагина |
| 🟢 **Статус сервера** | Онлайн, игроки, версия — на главной в реальном времени |
| 🎨 **3D-сцены** | Three.js: карта мира и пьедестал победителей |
| 🐳 **Деплой** | Docker + Compose + nginx + `vps-setup.sh` — с нуля до production по инструкции |

---

## 🧩 Серверный плагин

Paper API `1.21`, Java, Maven-shade в один `.jar`.

- **Античит-базлайн** — `AntiCheatListener` и `ViolationTracker` с накоплением нарушений.
- **Буфер событий** — `EventBuffer` переживает лаги сети и корректно дописывает остаток при выключении сервера.
- **Отправка в API** — `ApiSender` с ключом `GAME_API_KEY`, ретраями и защитой от потери данных.

---

## 🔐 Безопасность

> По внутреннему аудиту (`SECURITY_AUDIT.md`, повторная проверка 2026-07-12): **0 критических**, оценка **B+**, `npm audit --omit=dev` — 0 уязвимостей.

| Слой | Что сделано |
|---|---|
| **Electron** | `contextIsolation` + `sandbox` + CSP + `will-navigate` guard, никакого remote-content |
| **Загрузки** | Pinned SHA-1 для Forge, проверка хешей артефактов, защита от zip-slip, **запрет downgrade HTTPS → HTTP** на редиректах |
| **Токены** | В OS keychain через `safeStorage`; при недоступности — только в памяти, legacy plaintext удаляется |
| **Обновления** | Ed25519-подпись манифеста, приватный ключ **только** в GitHub Secret, в приложение вшит лишь публичный |
| **Пароли** | bcrypt; коды подтверждения хранятся как SHA-256, TOTP-секреты шифруются на диске |
| **Сессии** | `tokenVersion` для мгновенного глобального отзыва, rate-limit и lockout на логине |
| **Админка** | Обязательный TOTP, whitelist по IP, audit log каждого действия |

Проект прошёл **три независимых аудита** — отчёты лежат в репозитории открыто, вместе с нерешёнными пунктами: [`docs/AUDIT-2026-06-11.md`](docs/AUDIT-2026-06-11.md), [`docs/ADVERSARIAL_CODE_REVIEW_2026-08-20.md`](docs/ADVERSARIAL_CODE_REVIEW_2026-08-20.md), [`docs/CODE-REVIEW-FULL-2026-09-07.md`](docs/CODE-REVIEW-FULL-2026-09-07.md).

---

## 🏷️ Ребрендинг под свой сервер

Проект **не приколочен** к `vibestudy.ru`. Идентичность вынесена в две точки:

```ts
// brand.config.ts — лаунчер, build-time
export const BRAND = {
  name: 'NATUX WORLD',
  siteOrigin: 'https://vibestudy.ru',
  serverHost: 'mc.vibestudy.ru',
  minecraftVersionLabel: '1.21.1 Forge',
  discordClientId: '',
};
```

```bash
# сайт — переменные окружения
NEXT_PUBLIC_SERVER_NAME=МОЙ СЕРВЕР
NEXT_PUBLIC_SITE_DOMAIN=example.ru
NEXT_PUBLIC_SERVER_IP=mc.example.ru
```

Меняете значения, собираете — получаете лаунчер и сайт под своим брендом.

---

## ⚙️ Быстрый старт

```bash
npm ci
npm run dev          # Vite + Electron с hot reload

cd website
npm ci
npm run dev          # Next.js на localhost:3000
```

| Скрипт | Что делает |
|--------|-----------|
| `npm run dev` | Разработка с hot reload |
| `npm run build` | Полная сборка и установщики (`electron-builder`) |
| `npm run build:web` | Только рендерер |
| `npm test` | Vitest — 106 тестов лаунчера |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |

<details>
<summary><b>Структура репозитория</b></summary>

```
NatuxWorld/
├── electron/                   # Main-процесс лаунчера
│   ├── main.ts                 # Окно, авто-апдейт, Electron fuses
│   ├── preload.ts              # Context-isolated мост → window.natux
│   ├── ipc/                    # Каналы и хендлеры
│   └── services/               # 19 сервисов: Launcher, Forge, Java, Minecraft,
│                               # Account, Update, UpdateTrust, Playtime, Discord…
├── src/                        # Renderer: React 19 + Zustand + Tailwind
│   ├── components/auth/        # LoginScreen, RegisterScreen, VerifyEmail, AuthGate
│   ├── store/ · pages/ · hooks/ · lib/
│   └── services/electron-bridge.ts   # Web-fallback: UI крутится и без Electron
├── website/                    # Next.js 14 + Prisma 7 + PostgreSQL
│   ├── src/app/api/            # 65 роутов: auth, yggdrasil, payments, admin…
│   ├── src/lib/                # 32 модуля: rcon, fulfillment, totp, coupons…
│   ├── prisma/                 # 15 моделей, 21 миграция
│   ├── natux-plugin/           # Paper-плагин (Java)
│   └── Dockerfile · nginx.conf · vps-setup.sh
└── docs/                       # Аудиты, гайды, спеки и планы фич
```

</details>

---

## 📦 Релизы и CI

Релиз управляется **одной строчкой в `package.json`** — теги руками ставить не нужно.

```bash
npm version 1.9.16 --no-git-tag-version
git commit -am "release: v1.9.16" && git push
```

Дальше GitHub Actions сам:

1. Прогоняет `typecheck` и тесты — **красные тесты останавливают релиз**.
2. Собирает `.exe` (NSIS и portable) и `.dmg`, публикует в GitHub Release.
3. Подписывает update-манифест ключом `UPDATE_SIGNING_PRIVATE_KEY`.
4. **Только после успешной публикации** ставит тег `vX.Y.Z`.

> Пункт 4 — не мелочь: он лечит реальный баг v1.8.0, когда упавшая публикация оставляла тег, и все повторные запуски считали версию уже выпущенной.

---

## 📥 Установка для игроков

Windows и macOS, обход SmartScreen и Gatekeeper, проверка контрольных сумм — **[docs/INSTALL.md](docs/INSTALL.md)**.

---

## 🤝 Что входит в передачу

- ✅ Оба репозитория с полной историей и открытыми отчётами аудитов
- ✅ Лаунчер под Windows и macOS плюс настроенный пайплайн релизов
- ✅ Сайт, API, админ-панель, схема БД и миграции
- ✅ Серверный плагин с исходниками
- ✅ Docker-конфигурация и инструкция деплоя на VPS с нуля
- ✅ Документация: передача, установка, деплой, миграция сервера, спеки фич

### Честно о том, чего пока нет

Ограничения не спрятаны — они перечислены в [docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md):

- Установщик Windows **без Authenticode** — SmartScreen показывает предупреждение. Ed25519 защищает канал обновления, но не имя издателя.
- macOS `.dmg` **без notarization** — при первом запуске нужен `xattr -cr`.
- Оба пункта закрываются покупкой сертификатов, код к этому готов.

---

<div align="center">

### Хотите посмотреть вживую?

**[mc.vibestudy.ru](https://mc.vibestudy.ru)** · **[Скачать лаунчер](https://github.com/Alex-dev-sys/NatuxWorld/releases)** · **[Условия передачи](docs/BUYER_HANDOVER.md)**

<sub>NATUX WORLD · 27 704 строки, 273 зелёных теста, три аудита и ноль скелетов в шкафу</sub>

</div>
