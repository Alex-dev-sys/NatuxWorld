<div align="center">

# ⚔️ NATUX WORLD

**Сайт для Minecraft-сервера с донат-магазином, автоматической выдачей привилегий и админ-панелью**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-private-red?style=flat-square)](#)

`mc.vibestudy.ru` · [vk.com/natuxworld](https://vk.com/natuxworld)

</div>

---

## Передача проекта / продажа

Для передачи двух связанных репозиториев есть отдельный документ с реальным
составом проекта, чек-листом доступа и production-проверками:
**[docs/BUYER_HANDOVER.md](docs/BUYER_HANDOVER.md)**.

---

## О проекте

Сайт для анархичного Minecraft-сервера **NATUX WORLD** в тёмной красно-чёрной стилистике PvP-магазина.

Игрок выбирает ранг → выбирает срок → вводит ник → оплачивает → донат выдаётся автоматически через RCON.

---

## Возможности

- 🛒 **Магазин доната** — 7 рангов × 3 срока (30 дней / 90 дней / навсегда)
- ✅ **Автовыдача через RCON** — LuckPerms-команды после подтверждения оплаты (с 3 попытками)
- 🔒 **Защита от двойной выдачи** — идемпотентная обработка webhook
- 💳 **Оплата** — ЮKassa (карты / СБП) + CryptoBot (крипта) + YooMoney; режим `multi` для совмещения
- 🎟️ **Промокоды** — валидация скидок перед созданием заказа
- 🏆 **Лидерборд** — рейтинг игроков
- 📋 **Страница заказа** — статус оплаты и выдачи
- 👤 **Авторизация** — регистрация + подтверждение по e-mail + 2FA (TOTP и e-mail) + app-passwords
- 🔑 **Yggdrasil** — собственный authserver для входа в Minecraft с аккаунтами сайта
- 🛡️ **Админ-панель** — таблица заказов, пользователи, RCON-консоль, промокоды, статистика, логи
- 🟢 **Статус сервера** — онлайн, кол-во игроков, версия
- 📱 **Адаптивная вёрстка** — работает на мобильных устройствах

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Стили | Tailwind CSS 3, Google Fonts (Press Start 2P, Inter) |
| Backend | Next.js API Routes |
| База данных | PostgreSQL + Prisma |
| Minecraft | RCON → LuckPerms, Yggdrasil authserver |
| Оплата | ЮKassa, CryptoBot, YooMoney |
| Деплой | Docker, Nginx, VPS |

---

## Быстрый старт

```bash
# 1. Клонировать репозиторий
git clone https://github.com/Alex-dev-sys/minecraft-server
cd minecraft-server

# 2. Установить зависимости
npm install

# 3. Скопировать конфиг окружения
cp .env.example .env

# 4. Применить миграции БД
npx prisma migrate deploy

# 5. Запустить dev-сервер
npm run dev
```

Открыть в браузере: **http://localhost:3000**

---

## Переменные окружения

Скопируй `.env.example` в `.env` и заполни:

```env
# Публичные настройки
NEXT_PUBLIC_SERVER_NAME="NATUX WORLD"
NEXT_PUBLIC_SERVER_IP="mc.vibestudy.ru"
NEXT_PUBLIC_SITE_DOMAIN="vibestudy.ru"

# Платёжная система (mock | yookassa | cryptobot | yoomoney | multi)
# multi = ЮKassa для карт/СБП + CryptoBot для крипты
PAYMENT_PROVIDER="mock"

# RCON (подключение к Minecraft)
RCON_HOST="127.0.0.1"
RCON_PORT="25575"
RCON_PASSWORD="your_rcon_password"

# База данных
DATABASE_URL="postgresql://user:password@localhost:5432/natux"

# JWT (авторизация пользователей)
JWT_SECRET="your_jwt_secret"
```

---

## Структура проекта

```
src/
├── app/
│   ├── page.tsx                          # Главная страница
│   ├── shop/page.tsx                     # Магазин доната
│   ├── order/[publicId]/page.tsx         # Статус заказа
│   ├── pay/[id]/page.tsx                 # Страница оплаты
│   ├── leaderboard/page.tsx              # Лидерборд
│   ├── rules/page.tsx                    # Правила сервера
│   ├── map/page.tsx                      # Карта мира
│   ├── join/page.tsx                     # Как подключиться
│   ├── news/page.tsx                     # Новости
│   ├── admin/page.tsx                    # Админ-панель
│   └── api/
│       ├── auth/                         # Регистрация, вход, 2FA, verify-email, me
│       ├── yggdrasil/                    # Authserver + sessionserver для Minecraft
│       ├── products/                     # GET /api/products
│       ├── orders/                       # POST /api/orders, GET /api/orders/:id
│       ├── payments/yookassa/            # Webhook ЮKassa
│       ├── payments/cryptobot/           # Webhook CryptoBot
│       ├── payments/yoomoney/            # Webhook YooMoney
│       ├── payments/webhook/mock/        # Mock-оплата (dev)
│       ├── coupons/validate/             # Валидация промокодов
│       ├── leaderboard/                  # GET /api/leaderboard
│       ├── server/status/               # GET /api/server/status
│       ├── game-event/                   # Игровые события
│       ├── crash-report/                 # Репорты об ошибках
│       └── admin/                        # Заказы, пользователи, RCON, статистика
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── ServerStatus.tsx
│   ├── ShopClient.tsx
│   └── OrderClient.tsx
└── lib/
    ├── types.ts                          # TypeScript типы
    ├── products.ts                       # Данные рангов и цен
    ├── rcon.ts                           # RCON-клиент + шаблоны команд
    ├── yookassa.ts                       # Интеграция ЮKassa
    └── db.ts                             # Prisma client + PostgreSQL adapter
```

---

## API

### Публичное

| Метод | Маршрут | Описание |
|---|---|---|
| `GET` | `/api/products` | Список рангов |
| `POST` | `/api/orders` | Создать заказ |
| `GET` | `/api/orders/:publicId` | Статус заказа |
| `GET` | `/api/server/status` | Статус Minecraft-сервера |
| `GET` | `/api/leaderboard` | Рейтинг игроков |
| `POST` | `/api/coupons/validate` | Проверить промокод |
| `POST` | `/api/payments/webhook/mock` | Mock-оплата (dev) |

### Авторизация

| Метод | Маршрут | Описание |
|---|---|---|
| `POST` | `/api/auth/register` | Регистрация |
| `POST` | `/api/auth/login` | Вход |
| `POST` | `/api/auth/verify-email` | Подтверждение e-mail |
| `GET` | `/api/auth/me` | Текущий пользователь |
| `POST` | `/api/auth/2fa/totp/setup` | Настроить TOTP |
| `POST` | `/api/auth/logout` | Выход |

### Yggdrasil (Minecraft auth)

| Маршрут | Описание |
|---|---|
| `/api/yggdrasil/authserver/authenticate` | Вход в Minecraft |
| `/api/yggdrasil/sessionserver/session/minecraft/join` | Join-сессия |
| `/api/yggdrasil/sessionserver/session/minecraft/hasJoined` | Проверка сессии |

### Админское

| Метод | Маршрут | Описание |
|---|---|---|
| `GET` | `/api/admin/orders` | Все заказы |
| `POST` | `/api/admin/orders/:id/retry-delivery` | Повторить выдачу |
| `GET` | `/api/admin/users` | Все пользователи |
| `POST` | `/api/admin/rcon` | Выполнить RCON-команду |
| `GET` | `/api/admin/stats` | Статистика |

---

## Тест покупки (mock-режим)

1. Открыть **`/shop`**
2. Выбрать ранг и срок
3. Ввести ник (например `Notch`)
4. Нажать **Купить** → откроется `/order/...`
5. Нажать **Mock: Оплатить и выдать**
6. Статус станет `delivered`, появятся RCON-команды
7. Заказ появится в **`/admin`**

---

## Статусы заказа

| Статус | Значение |
|---|---|
| `waiting_payment` | Ожидает оплаты |
| `delivery_pending` | Оплачен, ожидает выдачи |
| `delivered` | Донат выдан ✅ |
| `delivery_failed` | Ошибка RCON ⚠️ |
| `cancelled` | Отменён |

---

## Ранги

| Ранг | 30 дней | 90 дней | Навсегда |
|---|---|---|---|
| Baron | 99 ₽ | 249 ₽ | 499 ₽ |
| Guard | 149 ₽ | 399 ₽ | 799 ₽ |
| Hero | 249 ₽ | 649 ₽ | 1 299 ₽ |
| Aspid | 349 ₽ | 899 ₽ | 1 799 ₽ |
| Squid | 499 ₽ | 1 299 ₽ | 2 599 ₽ |
| Head | 699 ₽ | 1 799 ₽ | 3 599 ₽ |
| Elite | 999 ₽ | 2 499 ₽ | 4 999 ₽ |

---

## Безопасность

- Цена берётся **только с backend** — frontend не может её подменить
- Донат выдаётся **только после webhook** от платёжной системы
- Повторный webhook **не выдаёт донат второй раз**
- YooKassa сверяется повторным API-запросом: order metadata, сумма и валюта должны совпасть
- Команды выдачи фиксируются в заказе при checkout и не меняются вместе с каталогом
- Секреты хранятся **только в `.env`**
- RCON-пароль **не попадает в код**
- Имена пользователей и ранги валидируются регексом перед передачей в RCON-команды
- JWT и игровые токены отзываются при logout/reset/бане; игровые токены имеют TTL

---

<div align="center">

**NATUX WORLD** · `mc.vibestudy.ru` · [VK](https://vk.com/natuxworld)

*No rules. No mercy.*

</div>
