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
- `ADMIN_SECRET` — случайная строка ≥32 символов
- `RCON_PASSWORD` — пароль RCON из server.properties Minecraft
- `YOOMONEY_WALLET` — номер кошелька YooMoney (если используешь)
- `YOOMONEY_SECRET` — секрет уведомлений из настроек YooMoney
- `PAYMENT_PROVIDER` — `yoomoney` или `mock`

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
