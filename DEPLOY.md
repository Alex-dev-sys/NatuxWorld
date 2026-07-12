# Деплой NATUX WORLD на VPS

## Требования
- Ubuntu 22.04+ / Debian 12+
- Docker + Docker Compose v2
- Домен natuxworld.ru → IP сервера

---

## 1. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# перелогиниться
```

## 2. Клонирование репозитория

```bash
git clone https://github.com/Alex-dev-sys/minecraft-server /srv/natux
cd /srv/natux
```

## 3. Настройка переменных окружения

```bash
cp .env.example .env
nano .env
```

Заполни обязательно:
- `POSTGRES_PASSWORD` — любой случайный пароль для БД
- `ADMIN_PASSWORD` — пароль для входа в /admin
- `ADMIN_SECRET` — случайная строка ≥32 символов (`openssl rand -hex 32`)
- `JWT_SECRET` — случайная строка ≥32 символов (`openssl rand -hex 32`)
- `ADMIN_TOTP_SECRET` — TOTP secret обязательного второго фактора администратора
- `ADMIN_ALLOWED_IPS` — разрешённые IP админ-панели через запятую
- `TWOFA_ENC_KEY` — 32 байта hex (`openssl rand -hex 32`)
- `GAME_API_KEY` — ключ Paper-плагина
- `YGGDRASIL_PRIVATE_KEY` — RSA private key authlib-injector
- `RCON_PASSWORD` — пароль RCON из server.properties Minecraft
- `PAYMENT_PROVIDER` — `mock`, `yookassa`, `cryptobot` или `multi`

### Настройка SMTP (отправка кодов подтверждения)

**Яндекс Почта (рекомендуется):**
1. Создай почту вида `noreply@yourdomain.ru` или используй существующую `@yandex.ru`
2. В настройках аккаунта → «Безопасность» включи **«Пароли приложений»**
3. Создай пароль для приложения, вставь в `SMTP_PASS`
4. Параметры: `SMTP_HOST=smtp.yandex.ru`, `SMTP_PORT=465`

**Gmail:**
1. Включи двухфакторную аутентификацию в аккаунте Google
2. «Управление аккаунтом» → «Безопасность» → «Пароли приложений» → создай пароль
3. Параметры: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`

**Resend (лучший вариант для продакшена, бесплатный план 3000 писем/мес):**
1. Зарегистрируйся на [resend.com](https://resend.com), добавь и подтверди домен
2. Создай API-ключ в разделе API Keys
3. Параметры: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<api_key>`

## 4. SSL-сертификат (Let's Encrypt)

```bash
# Перед первым запуском — получаем сертификат через certbot
sudo apt install certbot
sudo certbot certonly --standalone -d natuxworld.ru -d www.natuxworld.ru
```

## 5. Первый запуск

```bash
docker compose up -d --build
```

Первый запуск автоматически выполнит миграции БД (`prisma migrate deploy`).

## 6. Проверка

```bash
docker compose ps          # все сервисы running
docker compose logs app    # логи приложения
docker compose logs nginx  # логи nginx
```

Открой https://natuxworld.ru — сайт должен работать.

---

## Обновление

```bash
git pull
docker compose up -d --build
```

## Настройка YooMoney

1. Зайди в [Настройки уведомлений YooMoney](https://yoomoney.ru/transfer/myservices/http-notification)
2. URL уведомлений: `https://natuxworld.ru/api/payments/yoomoney`
3. Метод: POST
4. Задай секрет, вставь его в `YOOMONEY_SECRET` в `.env`
5. В поле `Тип формы` в quickpay используй wallet/shop

## RCON — проверка подключения

Убедись что в `server.properties` Minecraft:
```
enable-rcon=true
rcon.port=25575
rcon.password=<твой RCON_PASSWORD>
```

Тест RCON из контейнера:
```bash
docker compose exec app sh
# внутри контейнера:
# host.docker.internal должен резолвиться в IP хоста
nslookup host.docker.internal
```

## Перезапуск при сбое

Все сервисы настроены на `restart: unless-stopped` — перезапускаются автоматически.

Принудительный перезапуск:
```bash
docker compose restart app
```

## Reverse proxy — заголовки client IP (ОБЯЗАТЕЛЬНО для rate limiting)

Rate limiting и блокировка брутфорса опираются на реальный IP клиента из
`X-Forwarded-For`. nginx должен **перезаписывать** этот заголовок значением
`$remote_addr`, а не дописывать клиентское (`$proxy_add_x_forwarded_for`) —
иначе атакующий подделает IP и обойдёт лимит.

В `server`/`location` блоке, проксирующем на Next.js:
```nginx
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $remote_addr;   # overwrite, НЕ $proxy_add_x_forwarded_for
proxy_set_header X-Forwarded-Proto $scheme;
```
