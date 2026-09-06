# Code Review — NatuxWorld Launcher

**Дата:** 2026-09-06 · **Версия:** 1.9.15 · **Ветка:** master
**Объём:** весь исходный код (`electron/`, `src/`, `scripts/`, конфиги) — 91 файл, ~9 350 строк
**Метод:** сплошное чтение + `tsc -b --noEmit`, `eslint .`, `vitest run`

---

## 1. Summary

Electron-лаунчер Minecraft с аккаунтами (email + 2FA), автоустановкой Java 21/Forge, подписанными
обновлениями и React-интерфейсом. **Инженерное качество ядра высокое** — цепочка доверия загрузок,
Ed25519-подпись обновлений, sandbox-рендерер, санитизация IPC-границы. Автоматические проверки
чистые: typecheck без ошибок, lint без предупреждений, 101/101 тестов проходят.

Тем не менее найдены **3 критических дефекта**, ломающих поведение у конечного пользователя
(ложная тревога о взломе лаунчера, невозможность отменить/восстановить зависший запуск), и группа
**мёртвых настроек**, которые UI показывает как рабочие, а бэкенд игнорирует.

**Вердикт: Request Changes.**

---

## 2. Критические (чинить до релиза)

### C1. Проверка целостности всегда проваливается → пугающее окно у всех пользователей

`electron/services/UpdateService.ts:164-191`

`checkSelfIntegrity()` хеширует **установленный исполняемый файл** (`process.execPath`) и сравнивает
с `manifest.sha512`. Но `sha512` в манифесте — это хеш **инсталлятора NSIS**, взятый из `latest.yml`
(`scripts/sign-update-manifest.mjs:27,46`). Это разные файлы:

```
release/NATUX WORLD-Setup-1.9.15-x64.exe   105 438 157 байт  ← хеш в манифесте
release/win-unpacked/NATUX WORLD.exe       225 448 960 байт  ← что хешируется в рантайме
```

Совпадение невозможно. Условие срабатывания — `manifest.version === app.getVersion()`, то есть
**ровно у тех, кто обновился до последней версии**. Через 8 секунд после старта (`main.ts:256`) они
получают модальное окно «Файл лаунчера не совпадает с подписанным манифестом… возможно стороннее
изменение файлов» плюс красный тост «Не удалось проверить обновление» (`UpdateToast.tsx:63-65`).

**Как чинить:** добавить в манифест отдельное поле для хеша установленного бинарника
(например `appSha512`), считать его в `sign-update-manifest.mjs` из `release/win-unpacked/<product>.exe`,
и сверять с ним. Пока это не сделано — проверку нужно отключить, а не оставлять ложные срабатывания.
Тест на эту функцию сразу бы вскрыл проблему (см. §5).

### C2. «Отмена» не отменяет установку Java и Forge, лаунчер залипает

`electron/services/LauncherService.ts:171-179`, `JavaService.ts:218-267`, `ForgeService.ts:212-242`

`AbortController` пробрасывается только в `download.downloadMany` (`LauncherService.ts:248,262,272`).
Он **не доходит** до:

* `JavaService.install()` — свои `https.get`, сигнала не принимают;
* `ForgeService.spawnInstaller()` — дочерний процесс не попадает в `this.currentProc`, `cancel()` его не убивает.

Что видит пользователь: жмёт «Отмена» на стадии `java-check` или `forge-install` → UI пишет
«Отменено» и `isLaunching` сбрасывается (`useLauncherStore.ts:118-129`), но JRE продолжает качаться,
а инсталлятор Forge — работать. При этом в main-процессе `isLaunching` остаётся `true` до конца
пайплайна, поэтому повторное нажатие ИГРАТЬ отвечает **«Запуск уже идёт»** (`LauncherService.ts:182-184`).
Выход один — перезапуск лаунчера.

**Как чинить:** передавать `this.abort.signal` в `JavaService.install` (и дальше в `https.get`/`fetch`),
хранить процесс Forge-инсталлятора в поле и убивать его в `cancel()`, а также сбрасывать
`isLaunching` при отмене.

### C3. Ни у одной сетевой загрузки игрового контента нет таймаута

`JavaService.ts:190-216, 224-259` · `MojangService.ts:215-248` · `DownloadService.ts:118-178`

`http(s).get` без `timeout` в Node висит бесконечно на «полуоткрытом» сокете (типично для Wi-Fi с
переключением сети, капал-порталов, PPPoE). Ретраи (`withRetries`, `MAX_RETRIES`) не помогают —
попытка никогда не завершается ошибкой. Вместе с C2 это даёт **вечную «Загрузка JRE 21…» без
возможности отменить**.

Показательно, что во всех сервисах, где автор про таймаут не забыл, он есть:
`AccountService.ts:101` (6 с), `NewsService.ts:75` (6 с), `CrashReportService.ts:58` (6 с),
`UpdateTrust.ts:147` (`AbortSignal.timeout`). Здесь пропущено.

```ts
// DownloadService.fetchToFile — минимальная правка
const req = client.get(rawUrl, { headers, signal, timeout: 30_000 }, (res) => { /* … */ });
req.on('timeout', () => req.destroy(new Error(`Timeout for ${rawUrl}`)));
```

---

## 3. Мажорные

### M1. Настройки Java и JVM-аргументов не применяются (мёртвый UI)

`src/components/SettingsModal.tsx:200-263` ↔ `electron/services/LauncherService.ts:326-329`

UI даёт полный рабочий флоу: переключатель «Встроенный JRE / Свой путь», диалог выбора файла
(`settings:pickJava`), кнопка «Проверить» с реальным запуском `java -version`
(`handlers.ts:129-166`), поле JVM-аргументов с кнопкой сброса. Всё валидируется и сохраняется в
`settings.json`. И всё **сознательно игнорируется** при запуске:

```ts
// LauncherService.ts:326
// SECURITY: cfg.jvmArgs and cfg.javaPath are intentionally NOT forwarded to the launch arg builder.
```

Решение по безопасности правильное, но UI об этом не знает: игрок выбирает свою Java, видит
«Java OK: 21.0.5» — и играет на встроенной. Нужно либо реализовать безопасный проброс
(токенизация аргументов по whitelist префиксов, проверка `javaPath` через `probeJava` перед spawn),
либо убрать эти элементы из настроек.

### M2. `closeOnLaunch` — тумблер без реализации

`SettingsModal.tsx:265-267`. Значение сохраняется, но во всём `electron/` не читается ни разу
(проверено grep). Лаунчер никогда не закрывается при запуске игры.

### M3. «Сменить ник» ничего не меняет

`src/components/ProfileMenu.tsx:75-88` пишет ник в локальный `auth.json` через `auth.login()`.
Но в игру уходит имя из подтверждённой сессии аккаунта:

```ts
// handlers.ts:72
username: sanitizeUsername(session.user.username),
```

А в самом меню отображается `accountName ?? user?.username` (`ProfileMenu.ts:67`), то есть тоже
аккаунтный ник. Кнопка не влияет ни на игру, ни на интерфейс. Дополнительно: при невалидном нике
`submitRename` (строка 83) молча выходит — пользователь жмёт OK и не понимает, почему ничего не происходит.

### M4. Переключение авто-обновления действует только со следующего запуска

`electron/main.ts:247-253` создаёт `updateCheckInterval` один раз при старте, если `autoUpdate` включён.
`settingsService.onDidChange` (`main.ts:237-241`) перенастраивает трей и автозапуск, но интервал
не трогает. Подсказка в UI честно предупреждает про «применится при следующем запуске»
(`SettingsModal.tsx:26`), но это касается и **включения** — что уже неочевидно.

### M5. Кнопка «Email» в поддержке не работает

`src/pages/SupportPage.tsx:9` передаёт `mailto:support@natux.world` в `shell.openExternal`, а хендлер
пропускает только `http:`/`https:` (`handlers.ts:171-178`) и молча глотает всё остальное. Клик по
плитке Email не делает ничего. Нужно либо разрешить `mailto:` явным исключением, либо заменить
плитку на копирование адреса.

### M6. Границы IPC валидируются непоследовательно

`electron/ipc/handlers.ts`

* `account:register/verify/resend/login/login2fa/2faEnable` (строки 215-258) читают `p.username`,
  `p.email`, `p.code` без единой проверки. `p === undefined` → `TypeError` внутри хендлера →
  `invoke` реджектится сырым текстом ошибки в рендерер.
* `settings:set` (103-126) валидирует `memory`, `resolution`, `language`, `updateChannel` и булевы
  флаги, но **не имеет whitelist ключей** — любое поле из рендерера попадает в `settings.json`
  как есть (`SettingsService.set` делает `{...current, ...patch}`). Сейчас `javaPath`/`jvmArgs`
  не используются, так что эксплуатации нет, но защита держится на этом совпадении.

Это прямо противоречит правилу проекта в `CLAUDE.md`: *«Validate input at system boundaries»*.

```ts
const ALLOWED_KEYS = new Set(['memory','fullscreen','closeOnLaunch','language','resolution',
  'javaMode','autoUpdate','autoLaunch','crashReports','onboardingCompleted','minimizeToTray',
  'launchOnStartup','updateChannel','telemetryEnabled']);
for (const k of Object.keys(obj)) if (!ALLOWED_KEYS.has(k)) delete obj[k];
```

### M7. `SettingsService.reset()` вне очереди записи и неатомарен

`electron/services/SettingsService.ts:101-106`. `set()` сериализуется через `writeQueue` и пишет через
`.tmp` + `rename`, а `reset()` — ни того, ни другого. Параллельные `reset()` и `set()` (реально
достижимо: онбординг/слайдер памяти пишут в фоне) теряют изменения, а прерывание записи оставляет
битый JSON.

### M8. Гонка в учёте игрового времени

`electron/services/PlaytimeService.ts:52-67`. `load() → modify → save()` без блокировки, при этом
`endSession()` вызывается одновременно из двух мест: обработчика выхода игры
(`LauncherService.ts:352`) и `app.on('before-quit')` (`main.ts:277`). При закрытии лаунчера сразу
после выхода из игры сессия может быть учтена дважды или потеряна. Запись тоже неатомарна
(`save()` пишет прямо в целевой файл).

### M9. Ответ сервера аккаунтов принимается без валидации

`electron/services/AccountService.ts:139-149`

```ts
return { kind: 'session', session: res as unknown as StoredSession };
```

Что бы ни вернул бэкенд, оно тут же уходит в `saveStored()` и в `session.user.username`. Плюс
накопление тела ответа без ограничения размера (`data += c`, строка 104) — некорректный/скомпрометированный
ответ может съесть память main-процесса. Стоит проверять `typeof token === 'string' && user?.username`
и обрывать чтение после, скажем, 256 КБ.

### M10. Игровой токен лежит на диске в предсказуемом файле

`electron/services/MinecraftService.ts:164-186`. `launch-args.txt` создаётся в `gameDir` с правами по
умолчанию и содержит живой Yggdrasil-токен; удаляется через 10 секунд или по выходу процесса. При
падении main-процесса между записью и таймером файл остаётся. Имя фиксированное, каталог известен.
Стоит писать во временный файл со случайным именем и `mode: 0o600`.

### M11. SHA-1 считается дважды по каждому загруженному файлу

`electron/services/DownloadService.ts:110,167-170` — инкрементальный `hash.update(chunk)` на каждом
чанке, результат которого **никогда не используется**: строки 188-193 честно перехешируют файл
целиком (это правильно из-за resume). Лишний полный проход по сотням мегабайт ассетов на каждой
установке. Строку 110 и `hash.update` в обработчике `data` можно просто удалить.

### M12. Два HTTP-запроса вместо одного каждые 30 секунд

`useServerStatus.ts:19` вызывает `getStatus()` и `getInfo()`, обе дергают **один и тот же**
`/api/server/status` (`LauncherService.ts:568,588`). Комментарий в хуке (строки 11-12) специально
объясняет, что общий поллер сделан ради экономии запросов — но дублирование осталось. Достаточно
одного запроса с разбором в два объекта.

### M13. Пути из удалённых манифестов не проверяются на выход за каталог

`electron/utils/paths.ts:45-52,62-64`. `getLibraryPath(mavenName)` и `getAssetObjectPath(hash)`
подставляют значения из version.json / asset index прямо в `path.join`, без проверки, что результат
остался внутри `libraries/`/`assets/`. Сейчас это прикрыто сверкой sha1 всей цепочки манифестов
(отличный контроль, см. §6), но при распаковке zip аналогичная защита сделана явно
(`LauncherService.ts:490-493`, `JavaService.ts:279-283`) — здесь её стоит добавить для симметрии.

---

## 4. Минорные

**Данные и бренд**

* Ссылки сообщества захардкожены мимо `brand.config.ts`, который объявлен «единственным источником
  правды»: `discord.gg/natux`, `t.me/natuxworld`, `vk.com/natuxworld` (`Sidebar.tsx:49-53`),
  `forum.natux.world` (`Footer.tsx`), `support@natux.world` (`SupportPage.tsx`) — при том что
  `BRAND.siteOrigin` = `vibestudy.ru`. Похоже на мёртвые ссылки от прежнего домена.
* Фейковые значения при недоступном сервере: `Sidebar.tsx` показывает `142 онлайн`, `TPS: 20.0` и
  безусловное «Состояние сервера: Отличное»; `ServerInfo.tsx:67,73` — `20.0 (отлично)` и `52 мс`.
  При этом `StatsCards.tsx` делает всё правильно (`—` / «Нет данных») — расхождение внутри одного экрана.
* `getServerInfo()` возвращает захардкоженные `mode`, `map`, `difficulty`, `whitelist`
  (`LauncherService.ts:594-599`) как будто это данные с сервера.
* `useLauncherStore.ts:44` — дефолт `appVersion: '1.4.0'` при реальной 1.9.15; мелькает в футере до
  ответа IPC.

**Логика и API**

* `UpdateToast.tsx:52-57`: событие `progress` после `error` даёт «Загрузка v**undefined**…» (у
  состояния `error` нет поля `version`).
* `preload.ts:38` шлёт `java:install(version)`, хендлер аргумент игнорирует (`handlers.ts:95`),
  сигнатура `JavaService.install()` его вообще не принимает.
* `channels.ts:55-62`: `IPC.ACCOUNT` не содержит `LOGIN_2FA`, `2FA_SETUP`, `2FA_ENABLE`,
  `LOGOUT_GLOBAL`, а хендлеры (`handlers.ts:192-267`) используют строковые литералы вместо констант —
  смысл файла констант теряется.
* `DiscordRpcService` полностью выключен (`BRAND.discordClientId: ''`) — мёртвая фича плюс runtime-зависимость
  `@xhayper/discord-rpc` в `dependencies`. В `setInGame` ветка выглядит перевёрнутой: при **заданном**
  сервере показывается только ник, без сервера — ник + хост (`DiscordRpcService.ts:56`).
* `ForgeService.ts:197-210`: цикл «2 попытки» недостижим во второй итерации — `downloadMany` бросает
  исключение при несовпадении sha1 и выходит из метода.
* `SettingsService.ts:92` — `typeof fs.rename === 'function'` всегда истина (мёртвая ветка);
  `currentInstallId()` (110-112) — обёртка над чтением поля.
* `TelemetryService.ts:15` — `ALLOWED_EVENTS` дублирует TS-тип `TelemetryEvent`; `ENDPOINT` (строка 13)
  собирается регуляркой из URL статуса сервера — сломается при смене пути.
* `AccountService.ts:48-56`: если токен не расшифровывается, файл не удаляется — каждый запуск
  повторяет ту же неудачу.
* `LauncherService.ts:495-501` / `JavaService.ts:289-296`: `reject` внутри обработчика `entry` не
  закрывает zip-хендл; нет лимита на суммарный размер распаковки (zip-bomb).
* `UpdateTrust.ts:143-155`: `content-length` проверяется только если заголовок прислан; тело всё
  равно читается целиком до проверки размера.
* CSP `img-src 'self' data: https:` (`main.ts:200`) разрешает картинки с любого https-хоста —
  картинка в новости с чужого домена сливает IP пользователя.

**UI/UX и рендерер**

* Приватность: онбординг обещает «Ник, пароль и токен аккаунта не отправляются»
  (`OnboardingWizard.tsx:115`), но в отчёт о краше уходят последние 300 строк лога MC
  (`CrashReportService.ts:45`), где ник и пути пользователя присутствуют штатно
  (`[Render thread] Setting user: <ник>`). Формулировку стоит поправить либо чистить логи регуляркой.
* `useNews.ts:8` — `.then(setNews)` без `.catch` (unhandled rejection при ошибке IPC).
* `useServerStatus.ts:32` — `setInterval` никогда не очищается; `useServerStatusStore()` вызывается
  без селектора → лишние ререндеры всех подписчиков.
* `LoginScreen.tsx:46` — `password.length >= 8` блокирует вход пользователям со старым коротким паролем.
* `OnboardingWizard.tsx:13-16` и `SettingsModal.tsx:161` используют разные границы слайдера памяти
  (2048…8192 против 1024…всё ОЗУ).
* `PlaytimeCard.tsx:48` — опрос IPC каждые 30 с с чтением и парсингом `playtime.json`.
* `package.json:27-59` — `react`, `react-dom`, `zustand`, `framer-motion`, `recharts` и др. в
  `devDependencies`. Для бандлящегося рендерера это работает (и объяснено в `electron-builder.yml:7-10`),
  но семантически неверно и ломается при любом переходе на внешние модули.

---

## 5. Тесты

**Что хорошо:** 101 тест, все зелёные; `DownloadService` тестируется через настоящий локальный
HTTP-сервер (включая resume и SHA-1 mismatch); `UpdateTrust` покрыт по подписи, каналам и
детерминированности rollout-бакетов; `selectNativeLibs` покрыт по arm64/x86 матрице.

**Пробелы:**

| Область | Статус | Почему важно |
|---|---|---|
| `ipc/handlers.ts` | нет тестов | Главная граница доверия: `sanitizeUsername`, `sanitizeServer`, `clampMemory`, фильтрация настроек |
| `UpdateService` | нет тестов | Дефект C1 поймался бы первым же тестом на `checkSelfIntegrity` |
| Рендерер (`*.test.tsx`) | **ни одного** | `@testing-library/react`, `jsdom` и `environmentMatchGlobs` в `vitest.config.ts:10` настроены вхолостую |
| `SettingsService` конкурентность | нет | Дефект M7 |
| `PlaytimeService` | нет | Дефект M8 |
| `NewsService.sanitizeItem` | нет | Единственный барьер для данных с сайта |
| `vitest.e2e.config.ts` + `e2e-launch.real.ts` | не запускаются | Нет npm-скрипта — мёртвая конфигурация |
| `smoke.test.ts` | `expect(true).toBe(true)` | Ничего не проверяет |

---

## 6. Что сделано хорошо (не сломать при правках)

* **Цепочка доверия загрузок.** `version_manifest_v2` → sha1 version.json → sha1 asset index → sha1
  каждого объекта (`MojangService.ts:151-193`). Плюс запрет non-https и protocol downgrade
  (`DownloadService.ts:123-129`). Это выше среднего уровня для лаунчеров.
* **Подпись обновлений.** Ed25519-манифест, строгие регулярки на все поля, требование, чтобы
  подписанный артефакт был **единственным** кандидатом в фиде (`UpdateTrust.ts:127-141`) — грамотная
  защита от подмены порядка файлов. Staged rollout через детерминированный FNV-1a бакет.
* **Изоляция рендерера.** `sandbox: true` + `contextIsolation` + CSP на все ответы + блок навигации +
  whitelist протоколов в `openExternal` + electron-fuses (`RunAsNode`, `NODE_OPTIONS`, inspect — выкл).
* **Защита argfile.** `MinecraftService.toArgFile` вырезает управляющие символы перед квотированием
  (`:196-206`) — закрывает инъекцию дополнительных JVM-аргументов через ник/адрес сервера.
* **Хранение токена.** `safeStorage` с честной деградацией «только в память» вместо plaintext и
  удалением легаси-файла (`AccountService.ts:42-80`).
* **Производительность UI.** Батчинг логов раз в 150 мс, троттлинг прогресса до ~10/с с trailing-отправкой,
  рендер только хвоста лога, CSS-анимации вместо 26 JS-таймеров — всё с объясняющими комментариями.
* **Комментарии.** Почти везде объясняют *почему*, а не *что* (`LauncherService.ts:439-448` про
  коллизию нативных библиотек на Apple Silicon — образцовый пример).
* **i18n.** Приём `const en: typeof ru` даёт проверку паритета ключей на уровне типов.

---

## 7. Вопросы к автору

1. `javaPath` / `jvmArgs` / `closeOnLaunch` — планируется реализация с валидацией или элементы UI надо убрать?
2. `checkSelfIntegrity` задумывалась как проверка инсталлятора или установленного бинарника? Нужно ли добавлять `appSha512` в манифест?
3. Ссылки `natux.world` / `discord.gg/natux` актуальны при рабочем домене `vibestudy.ru`?
4. `FORGE_VERSIONS` содержит 1.21.6 / 1.21.1 / 1.20.1, но запуск жёстко зашит в `forge-1.21.1` (`useLauncherStore.ts:9`) — планируется выбор версии или остальные записи можно убрать?
5. Discord RPC (`discordClientId: ''`) — фича заморожена или ID просто не проставлен для сборки?

---

## 8. Приоритет починки

| # | Дефект | Effort |
|---|---|---|
| 1 | C1 — ложная проверка целостности | S (отключить) / M (добавить `appSha512`) |
| 2 | C3 — таймауты на всех HTTP-загрузках | S |
| 3 | C2 — отмена Java/Forge + сброс `isLaunching` | M |
| 4 | M1/M2/M3 — убрать или реализовать мёртвые настройки | S (убрать) / L (реализовать) |
| 5 | M6 — whitelist ключей и валидация `account:*` | S |
| 6 | M7/M8 — атомарность и очередь записи settings/playtime | S |
| 7 | M5, M11, M12 — mailto, двойной sha1, дубль запроса | S |
| 8 | Тесты на `handlers.ts` и `UpdateService` | M |
