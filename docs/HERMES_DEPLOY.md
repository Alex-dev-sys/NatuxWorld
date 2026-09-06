# Инструкция для Hermes: перенос NATUX WORLD на новый сервер

## Цель

Развернуть серверную часть монорепозитория NATUX WORLD на новом Ubuntu/Debian-сервере, восстановить PostgreSQL из backup и проверить сайт, backend API, платежи, email, RCON и админскую SSE-панель. Репозиторий содержит также Electron-лаунчер; на VPS нужно развернуть каталог `website`, а не запускать desktop launcher.

## Правила безопасности

- Не удаляй Docker volumes, базы, backup-файлы или старые конфигурации без явного подтверждения владельца.
- Не показывай секреты в логах, выводе команд или финальном отчёте.
- Все секреты храни только в `/srv/natux/website/.env` с правами `600`.
- Не коммить `.env`, ключи, backup-файлы и credentials.
- Если backup базы отсутствует или повреждён, остановись и сообщи об этом владельцу.
- Не проводи реальный платёж без подтверждения владельца; используй тестовый режим или минимальный тестовый платёж.
- Не открывай наружу PostgreSQL, RCON или порт приложения.

## 1. Проверка сервера и установка пакетов

```bash
cat /etc/os-release
uname -a
free -h
df -h
sudo apt update
sudo apt install -y git curl ca-certificates openssl ufw nginx certbot fail2ban
```

Установи Docker и Compose:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker
docker --version
docker compose version
```

Для firewall оставь только SSH, HTTP и HTTPS:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Проверь SSH-настройки. Должны быть включены ключевой доступ, `PermitRootLogin no` и `PasswordAuthentication no`. Не применяй эти изменения, пока не проверишь, что новый SSH-ключ действительно работает в отдельной сессии.

Включи fail2ban:

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```

## 2. Клонирование проекта

```bash
sudo mkdir -p /srv/natux
sudo chown -R "$USER":"$USER" /srv/natux
git clone https://github.com/Alex-dev-sys/NatuxWorld.git /srv/natux
cd /srv/natux/website
```

Если репозиторий приватный или URL не работает, запроси правильный URL и доступ у владельца. Не угадывай credentials.

Проверь наличие `Dockerfile`, `docker-compose.yml`, `prisma/schema.prisma`, миграций и `.env.example`.

## 3. Backup PostgreSQL

Сначала найди backup, не удаляя найденные файлы:

```bash
find /srv /root /home -type f \( -name '*.sql' -o -name '*.sql.gz' -o -name '*.dump' \) 2>/dev/null
```

Если backup найден:

1. Сделай его дополнительную копию.
2. Запусти PostgreSQL с постоянным Docker volume:
   ```bash
   cd /srv/natux/website
   docker compose up -d postgres
   docker compose ps
   ```
3. Дождись состояния `healthy`.
4. Восстанови backup в базу `natux`.
5. Проверь количество пользователей, заказов, платежей и административных записей.

Если backup отсутствует, остановись и сообщи владельцу, что старые данные восстановить нельзя. Не создавай пустую production-базу без подтверждения.

Не используй `docker compose down -v` и `prisma migrate reset`.

## 4. Node.js и зависимости

Если используется bare-metal-сборка, установи Node.js 18 через nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 18
nvm use 18
nvm alias default 18
node --version
npm --version
```

Для текущего production-проекта предпочтителен Docker Compose. Если используется bare-metal:

```bash
cd /srv/natux/website
npm ci
npx prisma generate
npm run build
```

## 5. Переменные окружения

```bash
cd /srv/natux/website
cp .env.example .env
chmod 600 .env
```

Заполни `.env` реальными значениями, но никогда не выводи его содержимое. Обязательные категории:

- `DATABASE_URL` и `POSTGRES_PASSWORD`;
- `JWT_SECRET`, `ADMIN_SECRET`, `ADMIN_PASSWORD`, `ADMIN_TOTP_SECRET`;
- `TWOFA_ENC_KEY`, `GAME_API_KEY`;
- SMTP host, user, password и sender;
- ключи YooKassa, CryptoBot или другого включённого платёжного провайдера;
- `RCON_PASSWORD`, `RCON_PORT`;
- `YGGDRASIL_PRIVATE_KEY`, если используется authlib-injector;
- SSH bridge-параметры Minecraft, если он включён;
- публичные доменные и социальные настройки.

Секреты не должны быть placeholder-значениями:

```bash
grep -nE 'change_me|your_|example|placeholder' .env
```

Если старые `JWT_SECRET`, `TWOFA_ENC_KEY` или другие ключи доступны, сохрани их: замена ключей может сделать старые токены и зашифрованные 2FA-секреты недействительными.

## 6. Миграции и сиды

После восстановления backup проверь миграции:

```bash
npx prisma migrate deploy
```

Сиды запускай только если в проекте есть штатный seed-скрипт и владелец подтвердил его запуск. Не запускай destructive reset.

## 7. Запуск production

Предпочтительный вариант для текущего проекта:

```bash
cd /srv/natux/website
docker compose build
docker compose up -d
docker compose ps
```

Compose должен запускать `postgres`, `app` и `nginx`, а PostgreSQL должен использовать постоянный volume. Приложение выполняет `prisma migrate deploy` при старте.

Если Docker Compose не используется, создай systemd unit для приложения с `Restart=always`, автозапуском и безопасным чтением `.env`. Не запускай приложение от root.

## 8. DNS, nginx и SSL

Убедись, что DNS основного домена и `www` указывает на новый сервер.

Настрой nginx как reverse proxy на приложение и редирект HTTP на HTTPS. Для rate limiting обязательно передавай реальный IP:

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

Не используй `$proxy_add_x_forwarded_for` для этого проекта.

Получи сертификат:

```bash
sudo certbot certonly --standalone -d example.com -d www.example.com
```

После настройки:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Если nginx работает в Compose, проверь монтирование `nginx.conf` и `/etc/letsencrypt`.

## 9. Проверки после запуска

```bash
curl -i https://example.com/api/health
docker compose ps
docker compose logs --tail=200 app
```

Health endpoint должен вернуть статус базы и приложения без ошибок.

Проверь вручную или безопасным тестом:

1. главную страницу и статику;
2. регистрацию и вход;
3. отправку email-кода;
4. вход администратора с 2FA;
5. создание заказа;
6. промокод;
7. тестовый платёж;
8. повторный webhook без повторной выдачи;
9. RCON-команду без опасных прав;
10. выдачу тестового ранга, только после подтверждения владельца;
11. SSE-админку;
12. rate limiting критичных auth/payment/admin роутов.

Minecraft RCON должен быть включён на сервере и доступен только локально или через защищённую сеть:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=<значение из env>
```

Не открывай порт 25575 всему интернету.

## 10. Резервное копирование

```bash
cd /srv/natux/website
chmod +x scripts/backup-postgres.sh
./scripts/backup-postgres.sh
find backups/postgres -maxdepth 1 -type f -print
```

Настрой ежедневный запуск:

```cron
30 3 * * * cd /srv/natux/website && /srv/natux/website/scripts/backup-postgres.sh >> /var/log/natux-backup.log 2>&1
```

Копируй backup во внешнее хранилище. Один VPS не является резервной копией.

## 11. Финальный отчёт

Сообщи только:

- статус `postgres`, `app` и `nginx`;
- доступность домена и HTTPS;
- результат `/api/health`;
- восстановлен ли backup и сколько основных записей найдено;
- результат email, платежного теста, RCON и SSE;
- настроены ли cron-backup и внешняя выгрузка;
- какие данные ещё нужны.

Никогда не включай в отчёт пароли, токены, TOTP, приватные ключи, RCON password, SMTP password, платёжные секреты или содержимое `.env`.
