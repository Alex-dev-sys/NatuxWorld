# Полный аудит кода NatuxWorld

**Дата завершения:** 2026-09-07. **Снимок:** `c32f008`; версия лаунчера 1.9.15.
**Задача:** проверить код лаунчера, сайта/API, плагина и инфраструктуры и перечислить ошибки без изменения реализации.
**Метод:** скилл `code-reviewer`, статический анализ связей между модулями, проверка существующих тестов и сборок, безопасные локальные проверки отдельных предположений.
**Вердикт: Request Changes.** Найдено **35 дефектов: 6 P1, 28 P2, 1 P3**. P0 не установлен.

## Область и границы проверки

- Лаунчер: Electron main/preload/IPC, сервисы, React pages/components/hooks/stores, типы, загрузки Java/Minecraft/Forge, обновления, настройки, scripts и конфигурации.
- Сайт: 32 модуля lib, 65 API route.ts, middleware, Prisma schema и миграции, UI магазина/заказа/админки, страницы, 3D и эффекты, scripts, Docker/nginx/VPS и CI.
- Плагин: Java-исходники, очередь/отправка событий, обработчики и конфигурация.
- Проверены тесты обеих частей. Большие статические JSX/CSS и матрицы 3D-декора просматривались выборочно; утверждения о полном построчном доказательстве корректности нет. Сторонние зависимости целиком не аудировались.
- При начале аудита имелись незакоммиченные изменения; к завершению они вошли в c32f008. Находки относятся к текущему коду. Существующий отчёт только по лаунчеру сохранён отдельно, его предположения автоматически не переносились.
- Реальные платежи, RCON/SSH-администрирование, миграции и очистка production-БД не выполнялись. Docker build/start, упаковка установщика, реальный Minecraft и production UI не проверялись интеграционно. Maven отсутствует, доступный через PATH JDK — 11; целевая Java плагина — 21.
- Не включены вкусовые замечания, предполагаемая недоступность внешних ссылок и неподтверждённые гипотезы об уязвимостях.

## Результаты автоматических проверок

| Проверка | Результат |
|---|---|
| Лаунчер: npm test | 14 файлов, **101 тест прошёл** |
| Лаунчер: npm run typecheck | Успех |
| Лаунчер: npm run build:web | Успех: renderer, Electron main и preload |
| Сайт: npm test -- --reporter=dot | 41 файл, **153 теста прошли** |
| Сайт: npm run typecheck | Успех |
| Сайт: npm run build | Успех; предупреждение ESLint о custom fonts в layout.tsx:39 |
| Настоящий Request, два последовательных json() | Первое чтение содержит code, второе после catch — нет |
| Проверка /running\|active/i на inactive (dead) | true — ложный статус воспроизведён |
| Конструктор PrismaClient без adapter | PrismaClientInitializationError; запросы к БД не выполнялись |

Тесты выполнялись на коде, уже содержавшем рассматриваемые изменения; сборки выполнены при завершении аудита. Зелёные проверки не покрывают перечисленные ниже межмодульные сценарии. Команды памяти/маршрутизации из AGENTS.md оказались недоступны: указанный пакет @Codex-flow/cli возвращает npm 404.

## Критические для выпуска — P1

P1 означает высокий приоритет: нарушена защита учётных данных, возможна повторная выдача покупки, блокируется чистый деплой либо массово ломается пользовательское поведение. Это не означает одинаковую тяжесть всех пунктов или наличие подтверждённой эксплуатации.

### F01. [P1] Игровые токены не валидируются и не отзываются после перехода на SHA-256

**Где:** [website/src/app/api/yggdrasil/authserver/validate/route.ts:14](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/yggdrasil/authserver/validate/route.ts:14), [website/src/app/api/yggdrasil/authserver/refresh/route.ts:15](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/yggdrasil/authserver/refresh/route.ts:15), [website/src/app/api/yggdrasil/authserver/invalidate/route.ts:12](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/yggdrasil/authserver/invalidate/route.ts:12).

**Сценарий и последствия:** `authenticate` и `auth/game-session` сохраняют `hashGameToken(raw)`, а validate/refresh/invalidate ищут или удаляют исходный `raw`. Поэтому только что выданный токен получает 403 при проверке/обновлении. Invalidate отвечает 204, но не удаляет токен; корректно хеширующий `/join` продолжает его принимать. Refresh дополнительно записывает новый токен открытым текстом.

**Исправление:** Использовать `const tokenHash = hashGameToken(accessToken)` во всех поисках и удалениях; при записи нового токена также сохранять хеш. Сначала проверить runtime-тип входного значения.

**Регрессия/проверка:** Сквозной тест authenticate → validate → refresh → join → invalidate → join должен подтвердить работоспособность и фактический отзыв.

### F02. [P1] Email-2FA можно заменить своим TOTP, имея только действующую сессию

**Где:** [website/src/app/api/auth/2fa/totp/setup/route.ts:18](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/2fa/totp/setup/route.ts:18), [website/src/app/api/auth/2fa/totp/enable/route.ts:17](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/2fa/totp/enable/route.ts:17).

**Сценарий и последствия:** Подтверждение текущего фактора в `/setup` требуется только для метода `totp`. Для аккаунта с email-2FA действующий bearer JWT позволяет получить новый секрет, вычислить его код и вызвать `/enable`. Фактор заменяется, выдаются новые backup codes, сессии владельца отзываются. Это усиливает последствия кражи сессии; знание пароля или доступ к почте не требуются.

**Исправление:** Требовать свежее подтверждение текущего фактора при смене любого включённого метода; привязывать разрешение на смену к пользователю и короткому сроку действия.

**Регрессия/проверка:** Сессия аккаунта с email-2FA без подтверждения почтового/резервного кода не должна менять фактор.

### F03. [P1] Конкурирующие ручные повторы выдают один заказ несколько раз

**Где:** [website/src/app/api/admin/orders/[id]/retry-delivery/route.ts:35](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/admin/orders/[id]/retry-delivery/route.ts:35).

**Сценарий и последствия:** Два запроса администратора одновременно читают `delivery_failed`, затем оба безусловно записывают `delivery_pending` и вызывают `fulfillOrder`. Атомарного захвата, как в webhook, нет. Для штатных команд `parent addtemp ... accumulate` это означает двойное продление. Подтверждённый повтор `delivery_pending` также не отличает активную попытку от зависшей.

**Исправление:** Использовать условный атомарный claim с владельцем попытки; RCON выполняет только победитель. Зависшие попытки обрабатывать по сроку аренды, а не одному статусу.

**Регрессия/проверка:** Два параллельных retry одного заказа должны вызвать выдачу ровно один раз.

### F04. [P1] Чистая Docker-сборка вызывает Prisma postinstall до копирования схемы

**Где:** [website/Dockerfile:4](C:/Users/LXKLGNV/Documents/NatuxWorld/website/Dockerfile:4), [website/package.json:12](C:/Users/LXKLGNV/Documents/NatuxWorld/website/package.json:12).

**Сценарий и последствия:** После `COPY package*.json ./` выполняется `npm ci`, а package.json содержит `postinstall: prisma generate`. В этой стадии ещё нет `prisma/schema.prisma` и `prisma.config.ts`: они появятся только после следующего `COPY . .`. Генерация не находит схему и блокирует сборку. Наличие готового node_modules на машине разработчика это не исправляет.

**Исправление:** Скопировать `prisma/` и `prisma.config.ts` перед `npm ci` либо корректно организовать lifecycle и единственную явную генерацию после копирования схемы. Не отключать все install scripts без проверки зависимостей.

**Регрессия/проверка:** Собрать образ без кеша. Вывод установлен по последовательности Dockerfile и npm scripts; Docker build в аудите не запускался.

### F05. [P1] В runtime Docker-образе отсутствует конфигурация миграций Prisma 7

**Где:** [website/Dockerfile:20](C:/Users/LXKLGNV/Documents/NatuxWorld/website/Dockerfile:20), [website/Dockerfile:34](C:/Users/LXKLGNV/Documents/NatuxWorld/website/Dockerfile:34), [website/prisma.config.ts:11](C:/Users/LXKLGNV/Documents/NatuxWorld/website/prisma.config.ts:11).

**Сценарий и последствия:** Runner копирует каталог `prisma`, но не `prisma.config.ts`. URL datasource вынесен именно в этот config, а schema содержит только provider. CMD запускает `migrate deploy` перед сервером. После устранения предыдущей ошибки старт всё равно не получает настроенный datasource, несмотря на наличие DATABASE_URL в окружении.

**Исправление:** Включить конфигурацию и требуемые ей зависимости в финальный образ; проверить, что migration CLI реально загружает этот config.

**Регрессия/проверка:** Запустить миграции из чистого готового образа на тестовой БД. Это отдельный статически выявленный дефект runtime-стадии; реальная миграция не выполнялась.

### F06. [P1] Проверка целостности считает исправный установленный лаунчер повреждённым

**Где:** [electron/services/UpdateService.ts:172](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/UpdateService.ts:172), [scripts/sign-update-manifest.mjs:24](C:/Users/LXKLGNV/Documents/NatuxWorld/scripts/sign-update-manifest.mjs:24).

**Сценарий и последствия:** Скрипт подписывает SHA-512 NSIS-установщика из latest.yml. `checkSelfIntegrity()` хеширует установленный `process.execPath`, то есть другой файл. Когда версия манифеста совпадает с текущей, исправная Windows-установка получает предупреждение о повреждении примерно через 8 секунд после запуска.

**Исправление:** Добавить отдельный подписанный хеш установленного executable и проверять его. До появления такого поля не сравнивать приложение с хешем установщика.

**Регрессия/проверка:** Чистая установленная сборка текущего релиза должна проходить проверку; изменённый проверяемый файл — отклоняться.

## Существенные ошибки — P2

### F07. [P2] Регенерация резервных кодов всегда теряет переданный код

**Где:** [website/src/app/api/auth/2fa/backup-codes/regenerate/route.ts:16](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/2fa/backup-codes/regenerate/route.ts:16).

**Сценарий и последствия:** Тело запроса читается `req.json()` для пароля, затем повторно на строке 19 для `code`. Второе чтение настоящего Request бросает исключение; catch возвращает `{}`. После верного пароля обработчик всегда отвечает 400 «Код обязателен». Поведение однократного чтения воспроизведено локально.

**Исправление:** Разобрать тело один раз: `const { password, code } = await req.json()`; проверить оба поля.

**Регрессия/проверка:** Использовать настоящий Request/NextRequest в тесте успешной регенерации, а не mock json(), допускающий повторное чтение.

### F08. [P2] Открытие повторной настройки TOTP сразу уничтожает активный секрет

**Где:** [website/src/app/api/auth/2fa/totp/setup/route.ts:25](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/2fa/totp/setup/route.ts:25).

**Сценарий и последствия:** После проверки старого TOTP новый секрет сразу записывается в активное поле `totpSecretEnc`, пока `twoFactorEnabled` остаётся true. Если закрыть экран QR или потерять ответ, старый аутентификатор уже не работает, хотя `/enable` не вызывался. Комментарий про pending secret не соответствует хранению.

**Исправление:** Хранить новый секрет отдельно с TTL; заменять активный только после подтверждения кода нового секрета.

**Регрессия/проверка:** Начать перенастройку и отменить её: старый TOTP должен продолжать работать.

### F09. [P2] Повтор частичной выдачи игнорирует сохранённые успешные команды

**Где:** [website/src/lib/fulfillment.ts:36](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/fulfillment.ts:36).

**Сценарий и последствия:** После ошибки executeRcon возвращает подтверждённые успешные команды; они сохраняются в `order.rconCommands`. Следующий вызов fulfillment запускает весь шаблон с начала. Если первая команда уже продлила ранг, а вторая упала, ручной повтор снова продлит ранг. Внутренний checkpoint RCON действует только в пределах одного вызова.

**Исправление:** Хранить прогресс по индексам команд/попыткам и продолжать после подтверждённо выполненной части. Отдельно обрабатывать команды с неизвестным результатом при обрыве соединения.

**Регрессия/проверка:** Шаблон из двух команд: первая успешна, вторая падает; при повторе первая не выполняется снова.

### F10. [P2] После успешного повтора в заказе остаётся прежняя ошибка доставки

**Где:** [website/src/lib/store.ts:154](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/store.ts:154), [website/src/lib/fulfillment.ts:45](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/fulfillment.ts:45).

**Сценарий и последствия:** Вызывающий код очищает ошибку через `deliveryError: undefined`, но updateOrder полностью пропускает undefined. В БД статус становится delivered/refunded, а старое сообщение остаётся и показывается администратору.

**Исправление:** Различать отсутствие изменения и очистку: разрешить nullable-поле и передавать `deliveryError: null`; например, проверять наличие ключа через `"deliveryError" in updates`.

**Регрессия/проверка:** После неудачной, затем успешной выдачи deliveryError в БД и ответе должен отсутствовать.

### F11. [P2] Неуспешная SSH-команда считается успешным действием администратора

**Где:** [website/src/lib/mc-bridge.ts:63](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/mc-bridge.ts:63).

**Сценарий и последствия:** Обработчик `stream.on("close", ...)` не принимает exit code и всегда resolve(output). Ошибка удалённого start/stop/restart с ненулевым кодом становится HTTP-успехом и успешной записью аудита.

**Исправление:** Проверять код/сигнал завершения; при ошибке отклонять Promise с безопасным сообщением и записывать неуспех в аудит.

**Регрессия/проверка:** SSH stream закрывается с кодом 1: API не должен возвращать ok:true.

### F12. [P2] Отозванная админская cookie снова работает после перезапуска сервера

**Где:** [website/src/lib/adminSession.ts:23](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/adminSession.ts:23), [website/src/lib/adminSession.ts:55](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/adminSession.ts:55).

**Сценарий и последствия:** Отзыв хранится только в module-local Map. После logout и перезапуска процесса список пуст; ранее сохранённая cookie снова проходит HMAC и срок действия, до семи дней. Даже один контейнер регулярно перезапускается при деплое. Это не утверждение о безусловном обходе всех API через Edge: у API есть дополнительная проверка.

**Исправление:** Хранить сессии/отзывы в общем постоянном хранилище с TTL, доступном обработчикам проверки.

**Регрессия/проверка:** Создать cookie → logout → заново инициализировать сервер → повторить старую cookie: доступ должен остаться закрыт.

### F13. [P2] Незавершённый 2FA-вход переживает глобальный отзыв сессий

**Где:** [website/src/lib/twofaChallenge.ts:8](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/twofaChallenge.ts:8), [website/src/app/api/auth/login/2fa/route.ts:71](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/login/2fa/route.ts:71).

**Сценарий и последствия:** Challenge содержит sub/purpose, но не tokenVersion. После смены пароля или глобального отзыва ещё действующий пятиминутный challenge и правильный TOTP/backup code позволяют получить JWT уже с новой tokenVersion. Проверка ранее введённого пароля не инвалидируется вместе с остальными credentials.

**Исправление:** Включить версию credentials в challenge и сравнивать с актуальной при завершении; желательно одноразовое состояние challenge.

**Регрессия/проверка:** Выдать challenge → отозвать сессии/сменить пароль → завершить старый challenge: запрос должен отклоняться.

### F14. [P2] Некорректные типы JSON приводят к 500 на публичном login API

**Где:** [website/src/app/api/auth/login/route.ts:19](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/login/route.ts:19).

**Сценарий и последствия:** `as Record<string,string>` не валидирует вход. JSON null ломает destructuring, а `{login:123,password:"x"}` доходит до `login.toLowerCase()` и бросает TypeError до rate limit. Аналогичный подход встречается в регистрации, Yggdrasil и 2FA.

**Исправление:** Проверять non-null object и типы/длины каждого поля до доступа к ним; на некорректный запрос возвращать управляемый 4xx.

**Регрессия/проверка:** Тестировать null, массив, число вместо строки и отсутствующие поля настоящими HTTP-запросами.

### F15. [P2] Администратор может создать конфликт email только различием регистра

**Где:** [website/src/app/api/admin/users/[id]/route.ts:159](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/admin/users/[id]/route.ts:159), [website/src/app/api/auth/login/route.ts:37](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/api/auth/login/route.ts:37).

**Сценарий и последствия:** Операция set-email проверяет точное совпадение findUnique и сохраняет email без нормализации. Login ищет email без учёта регистра. Два значения User@example.com и user@example.com допускаются строковым unique, но становятся неоднозначными для входа/подтверждения.

**Исправление:** Использовать единую canonical-форму email во всех операциях и уникальность именно этой формы; перед миграцией обработать существующие коллизии.

**Регрессия/проверка:** При уже занятом адресе смена другого аккаунта на вариант с иным регистром должна вернуть конфликт.

### F16. [P2] Crash report передаёт ник и пути в логах вопреки обещанию анонимности

**Где:** [electron/services/CrashReportService.ts:40](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/CrashReportService.ts:40), [src/components/OnboardingWizard.tsx:115](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/OnboardingWizard.tsx:115).

**Сценарий и последствия:** Опция добровольная, но интерфейс прямо обещает не отправлять ник. Сервис только обрезает message/logs и передаёт их содержимое. При раннем падении строки вроде `Setting user: <ник>` или локальные пути остаются в отправляемом хвосте. Отсутствие отдельного поля token не гарантирует отсутствие секретов внутри строк; обязательную утечку токена штатным Minecraft код не доказывает.

**Исправление:** Редактировать идентификаторы и секреты до отправки, согласовать описание с реальным составом отчёта.

**Регрессия/проверка:** Проверять содержимое строк с ником, домашним путём и искусственным токеном, а не только верхнеуровневые ключи JSON.

### F17. [P2] Автозапуск Windows создаёт скрытое окно без трея

**Где:** [electron/main.ts:80](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/main.ts:80), [electron/main.ts:99](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/main.ts:99), [electron/main.ts:248](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/main.ts:248).

**Сценарий и последствия:** При launchOnStartup=true добавляется --hidden независимо от minimizeToTray. Если трей выключен, что является значением по умолчанию, окно невидимо и значка для управления процессом нет.

**Исправление:** Скрывать окно только после успешного создания трея либо обеспечить другой явный способ восстановления; проверить согласованность настроек.

**Регрессия/проверка:** Проверить все сочетания автозапуска и трея, включая ошибку создания Tray.

### F18. [P2] Временный сбой API удаляет сохранённую действительную сессию

**Где:** [electron/ipc/handlers.ts:192](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/ipc/handlers.ts:192).

**Сценарий и последствия:** Bootstrap на любую ошибку account.me, включая DNS, timeout и HTTP 500, вызывает clearStored(). Один запуск без связи удаляет credentials и заставляет заново проходить вход, хотя сервер их не отзывал.

**Исправление:** Удалять credentials только после подтверждённой невалидности сессии; временные ошибки сохранять как повторяемое состояние с возможностью retry.

**Регрессия/проверка:** Network error и HTTP 500 должны сохранять сессию; подтверждённый 401 — удалять.

### F19. [P2] Отмена не останавливает установку Java и Forge

**Где:** [electron/services/LauncherService.ts:171](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/LauncherService.ts:171), [electron/services/LauncherService.ts:234](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/LauncherService.ts:234), [electron/services/LauncherService.ts:292](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/LauncherService.ts:292).

**Сценарий и последствия:** AbortController не передаётся java.install/forge.install, а дочерний Forge-installer не является currentProc. UI уже показывает «Отменено», но IO/процесс продолжаются; повторный запуск отклоняется, пока старая стадия не завершится.

**Исправление:** Передавать отмену во все стадии и контролировать процесс установщика; завершать отмену после остановки старого pipeline. Не разрешать новую параллельную установку простым преждевременным сбросом флага.

**Регрессия/проверка:** Отмена на java-check и forge-install прекращает работу и позволяет безопасно запустить новую попытку.

### F20. [P2] Сетевые загрузки игрового контента могут зависнуть без предела

**Где:** [electron/services/JavaService.ts:192](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/JavaService.ts:192), [electron/services/JavaService.ts:232](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/JavaService.ts:232), [electron/services/DownloadService.ts:132](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/DownloadService.ts:132), [electron/services/MojangService.ts:223](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/MojangService.ts:223).

**Сценарий и последствия:** HTTP(S)-запросы в этих загрузчиках не имеют deadline/таймаута. Если сервер установил соединение и перестал отдавать данные, Promise остаётся pending; ретраи не запускаются. На Java это сочетается с неработающей отменой предыдущего пункта.

**Исправление:** Добавить общий deadline и/или таймаут простоя с фактическим destroy запроса; связать его с пользовательским AbortSignal. Например, timeout-обработчик должен вызывать `req.destroy(new Error("Download timeout"))`.

**Регрессия/проверка:** Локальный HTTP-сервер принимает соединение и не завершает ответ: загрузка обязана завершиться ошибкой за ограниченное время.

### F21. [P2] Повторное нажатие PLAY во время игры ломает состояние интерфейса

**Где:** [src/store/useLauncherStore.ts:52](C:/Users/LXKLGNV/Documents/NatuxWorld/src/store/useLauncherStore.ts:52), [src/store/useLauncherStore.ts:64](C:/Users/LXKLGNV/Documents/NatuxWorld/src/store/useLauncherStore.ts:64), [src/components/PlayButton.tsx:32](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/PlayButton.tsx:32).

**Сценарий и последствия:** Running сбрасывает isLaunching=false, поэтому кнопка активна. Второй play снимает текущую подписку, получает от backend «Запуск уже идёт», ставит error и снимает новую подписку. Игра работает, а интерфейс показывает ошибку и больше не получает её завершение.

**Исправление:** Ввести отдельный isRunning/проверку running в guard и disabled; не разрушать подписку действующего процесса из-за отказа повторного запуска.

**Регрессия/проверка:** Running → повторный PLAY → выход игры должен закончиться корректным idle, без ложной ошибки.

### F22. [P2] Выбор Java и JVM-параметров сохраняется, но не применяется

**Где:** [src/components/SettingsModal.tsx:188](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/SettingsModal.tsx:188), [src/components/SettingsModal.tsx:258](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/SettingsModal.tsx:258), [electron/services/LauncherService.ts:326](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/LauncherService.ts:326).

**Сценарий и последствия:** UI даёт выбрать/проверить собственную Java и сохранить JVM-аргументы. Backend сознательно не передаёт эти поля из-за риска выполнения непроверенного кода. Мотив безопасности обоснован; дефект в том, что интерфейс обещает рабочую настройку и не сообщает об игнорировании.

**Исправление:** Убрать/отключить неподдерживаемые поля с объяснением либо реализовать безопасную валидацию и применение. Не исправлять простым пробросом произвольных аргументов.

**Регрессия/проверка:** Разрешённая настройка должна реально изменять launch input; запрещённая — явно отвергаться.

### F23. [P2] Переключатель закрытия лаунчера при запуске не реализован

**Где:** [src/components/SettingsModal.tsx:265](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/SettingsModal.tsx:265).

**Сценарий и последствия:** closeOnLaunch хранится и валидируется, но отсутствует чтение этого параметра в поведении запуска/окна. После включения и успешного запуска лаунчер остаётся открытым.

**Исправление:** Реализовать определённую семантику после успешного запуска либо убрать переключатель; учесть дочерний процесс игры и режим трея.

**Регрессия/проверка:** Сравнить успешный запуск при true/false и проверить сочетание с minimizeToTray.

### F24. [P2] После аварийного выхода игровое время включает часы простоя

**Где:** [electron/services/PlaytimeService.ts:39](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/PlaytimeService.ts:39), [electron/services/PlaytimeService.ts:54](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/PlaytimeService.ts:54), [electron/services/PlaytimeService.ts:72](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/services/PlaytimeService.ts:72).

**Сценарий и последствия:** activeStart сохраняется на диске и после перезапуска считается живой сессией. Если процесс/питание завершились аварийно во время игры, следующий запуск через сутки показывает inGame=true и добавляет сутки простоя. beginSession не заменяет старое ненулевое значение.

**Исправление:** Восстанавливать незавершённую сессию по heartbeat/проверяемому процессу; не считать запись прошлого процесса текущей игрой.

**Регрессия/проверка:** Загрузить старый activeStart после перезапуска: простой не прибавляется как игровое время.

### F25. [P2] Кнопка Email в поддержке ничего не открывает

**Где:** [src/pages/SupportPage.tsx:10](C:/Users/LXKLGNV/Documents/NatuxWorld/src/pages/SupportPage.tsx:10), [electron/ipc/handlers.ts:174](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/ipc/handlers.ts:174).

**Сценарий и последствия:** Кнопка передаёт mailto:support@natux.world, но IPC openExternal допускает только HTTP/HTTPS и молча отбрасывает mailto.

**Исправление:** Сделать отдельное действие с фиксированным почтовым адресом или разрешить строго проверенный mailto.

**Регрессия/проверка:** Клик по Email должен вызвать разрешённое открытие почтового клиента или копирование адреса.

### F26. [P2] Скрипт очистки исторической телеметрии падает до начала работы

**Где:** [website/scripts/purge-telemetry.mjs:12](C:/Users/LXKLGNV/Documents/NatuxWorld/website/scripts/purge-telemetry.mjs:12), [website/src/lib/db.ts:12](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/db.ts:12).

**Сценарий и последствия:** В установленной Prisma 7 `new PrismaClient()` без adapter бросает PrismaClientInitializationError ещё до try. Скрипт, предназначенный в том числе для удаления старых строк команд с паролями, ничего не очищает. Конструктор безопасно проверен отдельно, без запроса к БД.

**Исправление:** Использовать PrismaPg/adapter и загрузку окружения аналогично основному backend; не дублировать несовместимый способ инициализации клиента.

**Регрессия/проверка:** Smoke-тест создания клиента без удаления данных; сам purge проверять только на изолированной тестовой БД.

### F27. [P2] Публичные настройки Compose не попадают в клиентский production bundle

**Где:** [website/docker-compose.yml:29](C:/Users/LXKLGNV/Documents/NatuxWorld/website/docker-compose.yml:29), [website/Dockerfile:8](C:/Users/LXKLGNV/Documents/NatuxWorld/website/Dockerfile:8), [website/src/lib/brand.ts:5](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/brand.ts:5).

**Сценарий и последствия:** NEXT_PUBLIC_* передаются только при запуске контейнера. Во время next build нет build args/ENV, а .env/.env.local исключены из контекста. Клиентский код получает значения по умолчанию, например mc.vibestudy.ru, даже если runtime environment указывает другой сервер.

**Исправление:** Передавать публичные значения до сборки либо отдавать клиентам явную runtime-конфигурацию с сервера.

**Регрессия/проверка:** Собрать образ с другим именем/IP и проверить отданную страницу/JS, а не только окружение контейнера.

### F28. [P2] Бесплатный промокод показывает ненулевую цену

**Где:** [website/src/components/ShopClient.tsx:430](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/components/ShopClient.tsx:430), [website/src/lib/coupons.ts:6](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/lib/coupons.ts:6).

**Сценарий и последствия:** Клиент различает только percent и остальные типы. Для free/value=0 остаётся полная цена; backend корректно рассчитывает 0. Цена и скидка в интерфейсе противоречат фактической бесплатной активации. Redirect бесплатной покупки при этом реализован корректно.

**Исправление:** Переиспользовать чистую функцию applyDiscount на клиенте и явно показывать бесплатную активацию.

**Регрессия/проверка:** price=100, type=free, value=0 должны дать 0 ₽ и на клиенте, и на сервере.

### F29. [P2] Страница ожидающего заказа в production предлагает неработающую mock-оплату

**Где:** [website/src/components/OrderClient.tsx:219](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/components/OrderClient.tsx:219), [website/src/components/OrderClient.tsx:95](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/components/OrderClient.tsx:95).

**Сценарий и последствия:** Для ожидающего оплаты заказа без проверки режима показаны «Режим разработки» и «Mock: Оплатить и выдать». В production endpoint mock закрыт, поэтому кнопка не работает. Из этой страницы нет полноценного продолжения настоящего платежа; это не обход защиты оплаты.

**Исправление:** Передать разрешённый сервером режим оплаты; показывать mock только в нём, а в production — ссылку/действие продолжения реального платежа.

**Регрессия/проверка:** Production waiting_payment не должен показывать mock-кнопку; реальная оплата должна быть возобновляемой.

### F30. [P2] HTTP-ошибка запроса деталей пользователя или аудита роняет админку

**Где:** [website/src/app/admin/page.tsx:211](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/admin/page.tsx:211), [website/src/app/admin/page.tsx:273](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/admin/page.tsx:273), [website/src/app/admin/page.tsx:1162](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/admin/page.tsx:1162).

**Сценарий и последствия:** Fetch сразу сохраняет r.json() без проверки r.ok. Ответ 401/404 вида {error:...} становится user или rows; render вызывает отсутствующее gameEvents.length либо rows.map. Сетевая ошибка также не обработана.

**Исправление:** Проверять статус и форму ответа до setState; обрабатывать 401 переходом ко входу, остальные ошибки отдельным состоянием.

**Регрессия/проверка:** Ответы 401/404 JSON и отклонённый fetch не должны приводить к падению компонента.

### F31. [P2] Остановленный Minecraft отображается как запущенный

**Где:** [website/src/app/admin/page.tsx:1043](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/app/admin/page.tsx:1043).

**Сценарий и последствия:** Регулярное выражение `/running|active/i` совпадает с `inactive (dead)`. Для такого вывода SSH-индикатор показывает «сервер запущен». Совпадение воспроизведено локально.

**Исправление:** Использовать структурированный статус или точный разбор active/running вместо поиска подстроки active.

**Регрессия/проверка:** Проверить отдельно active (running), inactive (dead), failed и недоступность SSH.

### F32. [P2] Плагин теряет остаток очереди событий при штатном выключении

**Где:** [website/natux-plugin/src/main/java/ru/vibestudy/natuxplugin/NatuxPlugin.java:39](C:/Users/LXKLGNV/Documents/NatuxWorld/website/natux-plugin/src/main/java/ru/vibestudy/natuxplugin/NatuxPlugin.java:39), [website/natux-plugin/src/main/java/ru/vibestudy/natuxplugin/EventBuffer.java:26](C:/Users/LXKLGNV/Documents/NatuxWorld/website/natux-plugin/src/main/java/ru/vibestudy/natuxplugin/EventBuffer.java:26).

**Сценарий и последствия:** onDisable вызывает flush один раз, а drain отдаёт максимум batch_size, по умолчанию 100. При очереди 101 событие даже успешная отправка оставляет одно событие только в памяти; при завершении оно теряется. Максимальная очередь — 10000, поэтому потеря может быть существенно больше.

**Исправление:** Сделать ограниченный временем drain нескольких батчей и сохранять остаток для следующего запуска; не блокировать остановку бесконечными сетевыми retry.

**Регрессия/проверка:** При очереди больше одного батча штатное выключение не должно безвозвратно терять остаток.

### F33. [P2] Production CSP блокирует шрифт текста на 3D-пьедестале

**Где:** [website/next.config.mjs:16](C:/Users/LXKLGNV/Documents/NatuxWorld/website/next.config.mjs:16), [website/src/components/three/Podium3D.tsx:56](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/components/three/Podium3D.tsx:56).

**Сценарий и последствия:** Production connect-src разрешает только self. Компоненты drei Text не задают локальный font; проверенная установленная troika-three-text использует внешний unicode-font-resolver на cdn.jsdelivr.net и XHR шрифтов. Такие загрузки запрещены CSP, поэтому текст пьедестала не может получить штатный шрифт. В dev https разрешён, что скрывает проблему.

**Исправление:** Поставлять локальный шрифт, покрывающий используемые символы, и согласовать Troika с CSP. Не ослаблять всю политику ради одного ресурса.

**Регрессия/проверка:** Проверить production-страницу и консоль CSP. Находка подтверждена конфигурацией и исходниками локальной зависимости; браузерный production-сценарий не запускался.

### F34. [P2] Смена ника в профиле меняет только неиспользуемую offline-учётную запись

**Где:** [src/components/ProfileMenu.tsx:75](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/ProfileMenu.tsx:75), [src/components/ProfileMenu.tsx:66](C:/Users/LXKLGNV/Documents/NatuxWorld/src/components/ProfileMenu.tsx:66), [electron/ipc/handlers.ts:72](C:/Users/LXKLGNV/Documents/NatuxWorld/electron/ipc/handlers.ts:72).

**Сценарий и последствия:** Кнопка вызывает offline logout/login и записывает auth.json. Отображаемое имя берётся из accountName, а игровое — из подтверждённой серверной сессии. Для вошедшего в аккаунт пользователя операция не меняет ни реальный ник в игре, ни отображаемое имя.

**Исправление:** Согласовать функцию с серверной моделью: настоящий разрешённый сценарий переименования либо удаление неподдерживаемого действия.

**Регрессия/проверка:** После разрешённого переименования меню и launch session должны использовать согласованный новый ник.

## Небольшие ошибки — P3

### F35. [P3] Reduced-motion ветка оставляет resize listener после размонтирования

**Где:** [website/src/components/HeroParticles.tsx:82](C:/Users/LXKLGNV/Documents/NatuxWorld/website/src/components/HeroParticles.tsx:82).

**Сценарий и последствия:** addEventListener получает анонимную обёртку, а removeEventListener — другую функцию resize. При повторных переходах на главную остаются обработчики и замыкания на удалённые canvas.

**Исправление:** Сохранить одну функцию: `const onResize = () => { resize(); drawStatic() }`; передавать её и при регистрации, и при удалении.

**Регрессия/проверка:** Повторные mount/unmount с prefers-reduced-motion не увеличивают число resize listeners.

## Что сделано хорошо

- Обновления привязаны к Ed25519-подписи и SHA-512 конкретного артефакта; дефект F06 относится к отдельной self-integrity проверке.
- Renderer изолирован sandbox/contextIsolation, preload предоставляет ограниченный API; загружаемые игровые файлы проверяются по хешам.
- Email OTP и резервные коды потребляются атомарно; authenticatedUser проверяет отзыв, бан и подтверждение почты.
- Webhook использует условный захват заказа, проверку платежа у провайдера и неизменяемый snapshot команд; слабое место — отдельный ручной retry.
- Логи лаунчера отправляются в UI пакетами; очередь событий плагина ограничена, retry имеет идентификаторы событий, аргументы игровых команд не логируются.
- Отправка crash reports и телеметрии включается пользователем; требуется исправить именно состав/описание crash reports.

## Пробелы тестирования и порядок исправления

1. **Учётные данные:** F01–F02, F07–F08, F12–F15. Нужны сквозные тесты жизненного цикла токенов, смены фактора и отзыва, а также настоящий Request вместо повторно читаемого mock-body.
2. **Заказы:** F03, F09–F10, F28–F29. Проверить конкурентные retry, частичную выдачу и согласованность UI/сервера. Существующие Prisma/RCON-моки не доказывают корректность гонок с реальной БД.
3. **Деплой и эксплуатация:** F04–F05, F26–F27, F32–F33. Нужны чистая Docker-сборка/старт на тестовой БД, smoke скриптов без удаления рабочих данных, Java 21/Maven и production-browser проверка.
4. **Лаунчер:** F06, F16–F25, F34. Не хватает тестов UpdateService, IPC-bootstrap, отмены каждой стадии, tray/autostart, Playtime lifecycle и React-взаимодействий. Live e2e harness не запускается обычным npm test и в аудите не выполнялся.
5. **Админка и эффекты:** F11, F30–F31, F35. Добавить проверки отрицательных HTTP/SSH-ответов и cleanup обработчиков. В проверенной области UI/плагина/scripts автоматических тестов этих сценариев не найдено.

## Вопросы по ожидаемому поведению

- «Закрывать лаунчер» должно завершать процесс или прятать окно, и как это сочетается с живой игрой и треем?
- Планируется ли поддержка собственной Java/JVM-аргументов и серверного переименования, либо соответствующие элементы нужно убрать?
- Что делать с выдачей, когда RCON-команда могла выполниться, но ответ потерян: ручная сверка, компенсация или идемпотентный серверный обработчик заказа?

Эти вопросы не требуются для принятия отчёта; они уточняют реализацию исправлений. Исходный код в рамках аудита не исправлялся.
