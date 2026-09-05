# 🔐 Security Audit — NatuxWorld

**Исходный аудит:** 2026-06-11 · **Повторная проверка:** 2026-07-12 · **Версия:** 1.9.8.

> Актуальность: этот документ содержит исторический журнал аудита. Для текущего
> состояния используйте разделы «Статус повторной проверки» и «Открытые риски».

## Статус повторной проверки 2026-07-12

Большая часть технических findings исходного аудита закрыта в актуальном коде:

- Electron обновлён с EOL-ветки 33 до 43;
- включены `sandbox`, CSP и `will-navigate` guard;
- запрещён HTTPS → HTTP downgrade;
- Forge installer проверяется по pinned SHA1;
- username/server валидируются на IPC-границе, control characters удаляются из argfile;
- при недоступном OS keychain токен остаётся только в памяти, legacy plaintext storage удаляется;
- version JSON и artifacts проверяются опубликованными хешами;
- Windows-обновления проверяются по отдельной Ed25519-подписи и SHA-512 до загрузки; macOS остаётся в ручном режиме.

## Открытые риски

Технические findings ниже закрыты повторной проверкой. На текущий момент остаются
только следующие организационные и релизные риски:

1. Windows/macOS artifacts всё ещё требуют code signing/notarization.
2. GitHub Actions следует закрепить по полным commit SHA и убрать непиннутую установку ImageMagick из release job.
3. Windows SmartScreen всё равно требует Authenticode/Store для доверенного имени издателя; macOS in-app update требует Developer ID/notarization.

Ниже сохранён исходный аудит как исторический журнал; его пункты нельзя считать текущим списком открытых дефектов без сверки со статусом выше.

`файл:строка | критичность | описание | как исправить`. Помечено **PRACTICAL** (эксплуатируется из сети/локально) vs **THEORETICAL** (требует уже скомпрометированного рендерера).

---

## 📊 Итоговая оценка: **B+ (хорошо, готово к закрытому запуску)**

Для лаунчера база сделана сильно: правильный Electron-baseline (`contextIsolation`, `nodeIntegration:false`), токен шифруется `safeStorage`, загрузки проверяются по sha1/sha256, защита от zip-slip, валидаторы без ReDoS, **нет XSS-стоков, нет секретов в репозитории, нет plaintext-паролей**. Prod-зависимости чисты (`npm audit --omit=dev` = 0).

**Что мешает оценке A:** отсутствие code signing/notarization и неполностью закреплённый CI supply chain. Исторические технические проблемы ниже уже закрыты и не должны считаться текущими дефектами.

| | Кол-во |
|---|---|
| 🔴 Критический | 0 |
| 🟠 Высокий | 4 |
| 🟡 Средний | 6 |
| 🟢 Низкий | 8 |

---

## 🟠 Высокие

### H1. Неподписанные авто-устанавливаемые обновления
`electron-builder.yml:14-33` + `electron/services/UpdateService.ts:32-33` | HIGH | **PRACTICAL**
Нет подписи кода (win: нет `certificateFile`; mac: `identity:null`). При этом `autoDownload:true` + `autoInstallOnAppQuit:true`. Целостность обновления держится только на TLS-к-GitHub + sha512 в `latest.yml` (идёт по тому же каналу). Чистый сетевой MITM подменить не сможет, **но** кто получит доступ к GitHub-релизу / `contents:write` токену / CI — выкатит вредоносный билд, который **молча установится** всем при следующем выходе. Подписи как gate нет.
**Фикс:** подписать Windows (OV/EV-сертификат) + notarize mac → electron-updater начнёт проверять `publisherName`. До тех пор: `autoInstallOnAppQuit:false` + явное согласие юзера; включить 2FA и tag-protection на репозитории.

### H2. Forge-installer исполняется без проверки целостности + допускается downgrade протокола
`electron/services/ForgeService.ts:159-168,177` + `electron/services/DownloadService.ts:98-113` | HIGH | **PRACTICAL**
`ensureInstaller` качает `forge-*-installer.jar` и проверяет только «открывается как zip» (sha1 нет), затем `spawnInstaller` запускает `java -jar <installer> --installClient`. А `DownloadService` следует редиректам и **переключается https→http**, если `Location` пришёл с `http:` (`client = target.protocol === 'https:' ? https : http`). Сетевой MITM может 302-редиректнуть запрос к maven на свой host и отдать валидный-zip-но-вредоносный jar → он исполнится → **RCE**.
**Фикс:** запиннить sha1/sha256 для каждого билда в `FORGE_VERSIONS` и проверять перед запуском; запретить downgrade в `DownloadService` (не следовать редиректам на `http:`, требовать совпадения схемы с исходной).

### H3. Electron 33 — EOL, множество известных CVE
`package.json:35` (electron 33.4.11) | HIGH | mitigated
Electron 33 снят с поддержки (~апрель 2025), Chromium ~130 — год+ непропатченных CVE. `npm audit` показывает ~18 advisory на Electron (ASAR integrity bypass, use-after-free, origin-spoof и др.). Смягчено тем, что грузится только локальный контент, `contextIsolation:true`, нет remote-content. Но это **главный приоритет апгрейда**.
**Фикс:** обновить до поддерживаемого мажора (36+), перетестить запуск/сборку.

### H4. Нет подписи → юзеров учат обходить защиту ОС
`electron-builder.yml` + `README.md` (секция macOS) | HIGH | UX/security
Без подписи SmartScreen/Gatekeeper ругаются на каждый запуск; README уже учит обходить Gatekeeper (`xattr -cr`). Это нормализует отключение защиты у пользователей.
**Фикс:** тот же, что H1 — подписать билды. После подписи инструкцию-обход убрать.

---

## 🟡 Средние

### M1. Нет Content-Security-Policy
`index.html` (нет CSP) + `electron/main.ts` (нет `onHeadersReceived`) | MEDIUM | **THEORETICAL** (defense-in-depth)
Ни meta-CSP, ни заголовка. `webSecurity` дефолтно вкл, но защиты в глубину нет: любой будущий HTML-инъекционный сток выполнится свободно, страница может стучаться на любой origin. Грузятся внешние Google Fonts.
**Фикс:** строгий CSP: `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://vibestudy.ru`.

### M2. `sandbox: false` — preload без песочницы
`electron/main.ts:31` | MEDIUM | **THEORETICAL**
Preload работает с полным Node. `contextIsolation:true` смягчает, но в связке с EOL-Chromium (H3) компрометация рендерера получает больше досягаемости. Preload использует только `contextBridge`/`ipcRenderer` — песочница его не сломает.
**Фикс:** `sandbox: true`.

### M3. Argfile-инъекция через несанитизированные username/server
`electron/services/MinecraftService.ts:176-181` + `electron/ipc/handlers.ts:33-38` | MEDIUM | **THEORETICAL** (нужен скомпрометированный рендерер)
`toArgFile` экранирует `\` и `"`, но **не переводы строк**, а аргументы джойнятся через `\n`. `username` принимается как любая строка (только `typeof==='string'`), `server` не санитизируется вообще — оба попадают в argfile (`--username`, `--quickPlayMultiplayer`). Значение с `\n` расщепляется в новые токены → инъекция произвольных JVM/game-аргументов.
**Фикс:** валидировать `username` по `^[A-Za-z0-9_]{1,16}$`, `server` по host[:port] на IPC-границе; в `toArgFile` отвергать control-символы.

### M4. Плейнтекстовый токен при недоступном safeStorage
`electron/services/AccountService.ts:63-66` | MEDIUM | **PRACTICAL (Linux)**
Когда `safeStorage.isEncryptionAvailable()` ложно (частый случай на Linux без keyring), bearer-токен пишется в `account.json` открытым текстом (`enc:false`). Любой локальный процесс/пользователь читает сессию.
**Фикс:** при недоступности шифрования не персистить токен (держать в памяти сессии) или явно предупредить; как минимум ставить права файла 0600.

### M5. version-json / asset-index не сверяются с sha1 из манифеста
`electron/services/MojangService.ts:134-167` | MEDIUM | **THEORETICAL** (нужен взлом TLS к Mojang)
`resolveVersion` и `resolveAssetIndex` не проверяют скачанные JSON против `sha1` из манифеста. Именно эти документы поставляют sha1 для всех последующих загрузок — подмена тут даёт подмену хешей артефактов. Единственная защита — https.
**Фикс:** проверять оба JSON по их опубликованному sha1 перед доверием/кэшированием.

### M6. Зависимости GitHub Actions не запиннены по SHA + unpinned choco
`.github/workflows/build.yml:26,31,76,114` | MEDIUM | supply-chain
Экшены по тегам (`@v4`), не по commit-SHA; `choco install imagemagick.app` — непиннутый сторонний бинарь в релизном джобе с `contents:write` токеном. Компрометация тега = компрометация пайплайна.
**Фикс:** пиннить экшены по полному SHA; запиннить версию choco-пакета или закоммитить готовый `icon.ico` и убрать шаг.

---

## 🟢 Низкие

- **L1.** `electron/main.ts` — нет `will-navigate` guard. Top-level навигация в рендерере загрузит remote-URL с привилегированным preload. Фикс: `webContents.on('will-navigate')` → `preventDefault` для всего вне app-origin.
- **L2.** `electron/services/ForgeService.ts` — см. H2; даже без MITM хорошо бы пиннить sha256 Forge per-build.
- **L3.** `src/store/useAuthStore.ts` — поле `accessToken?` в renderer-типе (сейчас всегда `'0'`, offline). Мёртвое поле провоцирует будущее злоупотребление. Фикс: убрать из типа.
- **L4.** `settings.jvmArgs` / `javaPath` — **мёртвый конфиг**, в запуск НЕ попадают (launch использует только `resolveJvmArguments` из манифеста + `java.detect()`). Сейчас НЕ вектор. Фикс: добавить комментарий-guard, чтобы будущая правка случайно не открыла цепочку «set jvmArgs → произвольные JVM-флаги».
- **L5.** `src/components/Footer.tsx:34` — `window.location.hash` из хардкод-массива (не из данных). Сейчас не open-redirect. Фикс: роутер `navigate()`.
- **L6.** `.gitignore` не покрывает `account.json` / `*.local.json` (живёт в userData, вне репо — но belt-and-suspenders). Фикс: добавить в .gitignore.
- **L7.** `electron-builder.yml` — нет Electron Fuses / asarIntegrity (`runAsNode`, `enableNodeCliInspectArguments` включены). Фикс: `@electron/fuses`.
- **L8.** `electron/services/MinecraftService.ts:155` — `launch-args.txt` содержит `auth_access_token`, но для offline это литерал `'0'` — реального секрета нет. Станет LOW-риском, если добавят Microsoft-auth.

---

## ✅ Подтверждённые хорошие контроли (не ломать)

- **Electron baseline:** `contextIsolation:true`, `nodeIntegration:false`, devtools только в dev, preload — фиксированный allow-list каналов без generic-passthrough.
- **Токен:** шифруется `safeStorage` (DPAPI/keychain), рендерер JWT никогда не видит, account-IPC возвращает только `{id,username,email}`. Logout полный (`clearStored` удаляет `account.json` + чистит сторы).
- **Загрузки:** библиотеки/ассеты/клиент — sha1+size из манифеста; JRE — sha256 от Adoptium; `.tmp` чистится на всех путях ошибки. **Все endpoint'ы HTTPS** (Mojang, Forge maven, vibestudy.ru).
- **Zip-slip:** все три экстрактора (Java/Forge/natives) отвергают `..`, абсолютные, NUL, backslash; natives дополнительно flatten в `basename`.
- **XSS:** нет `dangerouslySetInnerHTML`/`innerHTML`/`eval`; новости — статический локальный JSON, рендерятся как JSX-текст (React эскейпит). Сток XSS ≈ ноль.
- **openExternal:** и `setWindowOpenHandler`, и IPC-хендлер парсят URL и пускают только `http:`/`https:` (`file:`/`javascript:` заблокированы).
- **Валидаторы** (`src/lib/validators.ts`): все regex заякорены и **ReDoS-безопасны**; клиентская валидация дублируется в main + бэкенде.
- **Секреты:** в репо и git-истории **не найдено** ни одного реального секрета (только dummy `secret123`/`a@b.ru` в тестах/спеках). CI: `permissions: contents: write` явно ограничен, `pull_request` (не `pull_request_target`), тег после publish, concurrency-guard.
- **Prod-зависимости:** `npm audit --omit=dev` = **0 уязвимостей**. react-router 7.17 (CVE пропатчен), electron-updater 6.8.9 (CVE-2024-39698 пропатчен), yauzl чист.
- **Пароли:** только в локальном state компонентов, уходят прямо в IPC, нигде не логируются/не хранятся. `console.*` в `src/` — ноль.

---

## 🎯 Приоритет починки

1. **🟠 Подписать билды (Windows OV + mac notarize)** → закрывает H1 + H4, включает проверку publisher в авто-апдейте. До подписи — `autoInstallOnAppQuit:false` + 2FA/tag-protection на репо.
2. **🟠 Forge-installer: запиннить sha256 + запретить http-downgrade в DownloadService** (H2) — закрывает практический RCE-вектор.
3. **🟠 Обновить Electron 33 → 36+** (H3) — убирает массу Chromium-CVE.
4. **🟡 Добавить CSP + `sandbox:true` + `will-navigate`** (M1, M2, L1) — defense-in-depth одним коммитом.
5. **🟡 Валидировать username/server на IPC-границе + control-символы в argfile** (M3).
6. **🟡 Не персистить токен при недоступном safeStorage** (M4); sha1 version-json/asset-index (M5).
7. **🟡 SHA-пиннинг GitHub Actions + choco** (M6).
8. **🟢** Остальное (L1–L8): убрать мёртвый `accessToken`-тип, guard на jvmArgs, Fuses, .gitignore, Footer navigate.

> Заметка: `settings.jvmArgs` и `settings.javaPath` сейчас **не доходят** до запуска игры — самые очевидные «set→RCE» цепочки не эксплуатируются. Но это латентный риск: при первой же правке, что подключит `cfg.jvmArgs` в аргументы, нужна токенизация/валидация.
