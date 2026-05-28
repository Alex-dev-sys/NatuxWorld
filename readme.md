<div align="center">

# ⚔️ NATUX WORLD

**Сайт для Minecraft-сервера с донат-магазином, автоматической выдачей привилегий и админ-панелью**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-private-red?style=flat-square)](#)

`mc.natuxworld.ru` · [vk.com/natuxworld](https://vk.com/natuxworld)

</div>

---

## О проекте

Сайт для анархичного Minecraft-сервера **NATUX WORLD** в тёмной красно-чёрной стилистике PvP-магазина.

Игрок выбирает ранг → выбирает срок → вводит ник → оплачивает → донат выдаётся автоматически через RCON.

---

## Возможности

- 🛒 **Магазин доната** — 7 рангов × 3 срока (30 дней / 90 дней / навсегда)
- ✅ **Автовыдача через RCON** — LuckPerms-команды после подтверждения оплаты
- 🔒 **Защита от двойной выдачи** — идемпотентная обработка webhook
- 📋 **Страница заказа** — статус оплаты и выдачи в реальном времени
- 🛡️ **Админ-панель** — таблица заказов, статистика, ручной повтор выдачи
- 🟢 **Статус сервера** — онлайн, кол-во игроков, версия
- 📱 **Адаптивная вёрстка** — работает на мобильных устройствах

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Стили | Tailwind CSS 3, Google Fonts (Press Start 2P, Inter) |
| Backend | Next.js API Routes |
| База данных | In-memory (mock) → PostgreSQL + Prisma |
| Minecraft | RCON → LuckPerms |
| Оплата | Mock → YooKassa / Robokassa / FreeKassa |
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

# 4. Запустить dev-сервер
npm run dev
```

Открыть в браузере: **http://localhost:3000**

---

## Переменные окружения

Скопируй `.env.example` в `.env` и заполни:

```env
# Публичные настройки
NEXT_PUBLIC_SERVER_NAME="NATUX WORLD"
NEXT_PUBLIC_SERVER_IP="mc.natuxworld.ru"

# Платёжная система (после подключения)
PAYMENT_PROVIDER="mock"
PAYMENT_WEBHOOK_SECRET="your_secret"

# RCON (подключение к Minecraft)
RCON_HOST="127.0.0.1"
RCON_PORT="25575"
RCON_PASSWORD="your_rcon_password"

# База данных (после подключения Prisma)
DATABASE_URL="postgresql://user:password@localhost:5432/natux"
```

---

## Структура проекта

```
src/
├── app/
│   ├── page.tsx                          # Главная страница
│   ├── shop/page.tsx                     # Магазин доната
│   ├── order/[publicId]/page.tsx         # Статус заказа
│   ├── rules/page.tsx                    # Правила сервера
│   ├── map/page.tsx                      # Карта мира
│   ├── join/page.tsx                     # Как подключиться
│   ├── admin/page.tsx                    # Админ-панель
│   └── api/
│       ├── products/                     # GET /api/products
│       ├── orders/                       # POST /api/orders
│       ├── orders/[publicId]/            # GET /api/orders/:id
│       ├── payments/webhook/mock/        # POST /api/payments/webhook/mock
│       ├── server/status/               # GET /api/server/status
│       └── admin/orders/                # GET, retry-delivery
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── ServerStatus.tsx
│   ├── ShopClient.tsx
│   └── OrderClient.tsx
└── lib/
    ├── types.ts                          # TypeScript типы
    ├── products.ts                       # Данные рангов и цен
    ├── store.ts                          # Mock-хранилище заказов
    └── rcon.ts                           # Mock RCON + шаблоны команд
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
| `POST` | `/api/payments/webhook/mock` | Mock-оплата (dev) |

### Админское

| Метод | Маршрут | Описание |
|---|---|---|
| `GET` | `/api/admin/orders` | Все заказы |
| `POST` | `/api/admin/orders/:id/retry-delivery` | Повторить выдачу |

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

## Roadmap

- [ ] PostgreSQL + Prisma вместо mock-хранилища
- [ ] Настоящая RCON-выдача (`rcon-client`)
- [ ] Подключить платёжную систему (YooKassa / Robokassa)
- [ ] Авторизация в админ-панели (NextAuth / JWT)
- [ ] Ping Minecraft-сервера (`minecraft-server-util`)
- [ ] Уведомления в Discord / Telegram
- [ ] Промокоды со скидкой
- [ ] Редактирование рангов и цен из админки
- [ ] Логирование RCON-команд в БД

---

## Безопасность

- Цена берётся **только с backend** — frontend не может её подменить
- Донат выдаётся **только после webhook** от платёжной системы
- Повторный webhook **не выдаёт донат второй раз**
- Секреты хранятся **только в `.env`**
- RCON-пароль **не попадает в код**

---

<div align="center">

**NATUX WORLD** · `mc.natuxworld.ru` · [VK](https://vk.com/natuxworld)

*No rules. No mercy.*

</div>
