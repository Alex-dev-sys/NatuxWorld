# Публикация Natux World Launcher через собственный сайт

## Цель

Пользователь должен нажать кнопку «Скачать лаунчер» на сайте NATUX WORLD и получить Windows `.exe` с собственного домена. Пользователь не должен переходить на GitHub.

GitHub можно оставить внутренним хранилищем исходного кода и сборок, но публичная загрузка и автообновления должны идти через домен сайта.

## Важное требование безопасности

Нельзя переносить только `.exe`. Для безопасных автообновлений нужно публиковать весь комплект:

- установщик Windows `.exe`;
- `latest.yml` для `electron-updater`;
- подписанный `natux-update.json`;
- подпись `natux-update.json.sig`;
- при необходимости release notes.

Подпись Ed25519 и SHA-512 должны остаться включёнными. Лаунчер обязан проверять подпись manifest и SHA-512 фактически скачанного установщика перед установкой.

## Публичная структура URL

Используй отдельный каталог на том же домене:

```text
https://vibestudy.ru/downloads/NatuxWorld-Setup.exe
https://vibestudy.ru/downloads/latest.yml
https://vibestudy.ru/downloads/natux-update.json
https://vibestudy.ru/downloads/natux-update.json.sig
```

Для страницы загрузки:

```text
https://vibestudy.ru/download
```

Можно добавить постоянный URL:

```text
https://vibestudy.ru/downloads/latest.exe
```

Но metadata должна ссылаться на конкретный versioned artifact или на единственный доверенный файл, а не на неоднозначный список файлов.

## Задачи в репозитории NatuxWorld

Работай в монорепозитории:

```text
https://github.com/Alex-dev-sys/NatuxWorld
```

Electron-лаунчер находится в корне репозитория. Серверный сайт находится в `website`.

### 1. Перенести URL доверенных обновлений

В `electron/services/UpdateTrust.ts` замени GitHub URL на HTTPS URL собственного сайта:

```ts
export const UPDATE_MANIFEST_URL =
  'https://vibestudy.ru/downloads/natux-update.json';
export const UPDATE_SIGNATURE_URL =
  'https://vibestudy.ru/downloads/natux-update.json.sig';
```

Сохрани проверку:

- repository/version/schema;
- имени artifact;
- SHA-512;
- Ed25519 signature;
- channel и staged rollout.

Не принимай manifest с HTTP, с другого домена или с неподдерживаемым форматом.

### 2. Настроить provider electron-updater

В конфигурации `electron-builder` и `electron-updater` используй собственный generic provider или собственный HTTPS endpoint. Не оставляй production-загрузку привязанной к GitHub Releases.

Пример направления конфигурации:

```yaml
publish:
  provider: generic
  url: https://vibestudy.ru/downloads/
```

Проверь, что `latest.yml` и установщик находятся в одном provider URL и что URL artifact не указывает на GitHub.

Если конфигурация находится в `package.json`, отредактируй её там. Не добавляй секреты в конфигурацию сборки.

### 3. Усилить проверку скачанного файла

Перед `quitAndInstall` вычисляй SHA-512 именно файла установщика, который скачал `electron-updater`, и сравнивай его с подписанным `natux-update.json`.

Проверка только версии недостаточна. При несовпадении:

- не устанавливай обновление;
- удали или изолируй подозрительный временный файл;
- покажи пользователю понятное сообщение;
- запиши в диагностический лог только безопасное описание ошибки, без секретов.

Добавь regression test, где в feed присутствуют два `.exe`, а доверенным является только один. Такой feed должен быть отклонён или должен однозначно выбрать доверенный artifact.

### 4. Сборка релиза

После сборки Windows installer:

```bash
npm ci
npm run build
```

Скрипт подписи должен:

1. найти ровно один ожидаемый installer;
2. вычислить SHA-512;
3. создать `latest.yml`;
4. создать `natux-update.json`;
5. подписать manifest приватным Ed25519-ключом;
6. создать `natux-update.json.sig`;
7. остановиться при неоднозначном или отсутствующем artifact.

Приватный ключ подписи не должен попадать в Git, Docker image, сайт или логи. Храни его в CI secret или на отдельной машине сборки.

## Публикация файлов на сервере

Создай каталог загрузок вне исходников приложения, например:

```bash
sudo mkdir -p /srv/natux/downloads
sudo chown -R www-data:www-data /srv/natux/downloads
```

Загружай файлы во временные имена, а после полной проверки делай атомарное переименование. Не оставляй пользователям частично загруженный `.exe`.

Пример безопасной последовательности:

```bash
scp NatuxWorld-Setup.exe server:/srv/natux/downloads/NatuxWorld-Setup.exe.tmp
scp latest.yml server:/srv/natux/downloads/latest.yml.tmp
scp natux-update.json server:/srv/natux/downloads/natux-update.json.tmp
scp natux-update.json.sig server:/srv/natux/downloads/natux-update.json.sig.tmp
```

После проверки размеров и SHA-512 переименуй временные файлы в рабочие. Не выводи содержимое подписи или приватного ключа.

## Nginx

Настрой раздачу каталога или proxy endpoint только через HTTPS:

```nginx
location /downloads/ {
    alias /srv/natux/downloads/;
    autoindex off;
    add_header X-Content-Type-Options nosniff always;
    add_header Cache-Control "public, max-age=300" always;
}
```

Для установщика можно использовать:

```nginx
types {
    application/octet-stream exe;
}
```

Не разрешай загрузку файлов обратно через этот location. Запрети directory listing и скрытые временные файлы:

```nginx
location ~ /downloads/.*\.tmp$ {
    deny all;
}
```

После изменений:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Кнопка на сайте

Добавь публичную страницу `/download` и заметную кнопку:

```tsx
<a href="/downloads/NatuxWorld-Setup.exe" download>
  Скачать лаунчер для Windows
</a>
```

На странице укажи:

- поддерживаемую версию Windows;
- текущую версию лаунчера;
- размер файла;
- дату публикации;
- ссылку на SHA-512 только если это действительно нужно пользователю.

Кнопка не должна вести на GitHub.

Если позже появятся macOS/Linux-сборки, добавляй отдельные artifacts и отдельные provider metadata. Не смешивай их с Windows `.exe`.

## Автообновления

После установки лаунчер должен периодически обращаться к:

```text
https://vibestudy.ru/downloads/natux-update.json
https://vibestudy.ru/downloads/natux-update.json.sig
```

При найденной версии:

1. проверить channel и rollout;
2. проверить manifest signature;
3. проверить version и artifact;
4. скачать update через HTTPS;
5. вычислить SHA-512 скачанного файла;
6. сравнить его с подписанным значением;
7. только после этого показать «Перезапустить и установить».

Если любой шаг не пройден, установка должна быть отменена.

## Проверка

Проверь с чистой машины:

```bash
curl -I https://vibestudy.ru/downloads/NatuxWorld-Setup.exe
curl -I https://vibestudy.ru/downloads/latest.yml
curl -I https://vibestudy.ru/downloads/natux-update.json
curl -I https://vibestudy.ru/downloads/natux-update.json.sig
```

Ожидай:

- HTTPS без ошибок сертификата;
- HTTP 200;
- отсутствие редиректа на GitHub;
- отсутствие directory listing;
- корректный `Content-Type`;
- установщик скачивается полностью.

Затем проверь:

1. чистую установку через страницу сайта;
2. запуск установленного лаунчера;
3. обнаружение новой версии;
4. успешную проверку подписи;
5. успешную проверку SHA-512;
6. обновление и перезапуск;
7. отказ на изменённом `.exe`;
8. отказ на изменённом manifest;
9. отказ на подменённой подписи;
10. отказ на неоднозначном feed с несколькими `.exe`.

## Финальный отчёт

Сообщи только:

- URL страницы загрузки;
- URL provider для обновлений;
- доступность installer и metadata;
- результат чистой установки;
- результат автообновления;
- результат проверки подписи и SHA-512;
- результат тестов подмены;
- какие действия или credentials ещё требуются.

Не включай в отчёт приватный ключ подписи, секреты, токены, содержимое `.env` или значения платёжных credentials.

