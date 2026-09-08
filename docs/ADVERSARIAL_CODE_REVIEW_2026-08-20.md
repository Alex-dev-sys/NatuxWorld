# Adversarial code review — NATUX WORLD Launcher

**Дата:** 2026-08-20  
**Ревизия:** `9904a37` (`main`)  
**Версия приложения:** `1.9.15`  
**Вердикт:** **Request changes / выпуск блокировать до устранения High**  
**Остаточный риск:** высокий

## Краткий итог

Кодовая база имеет хороший базовый Electron-hardening и успешно проходит текущие проверки, но доверительные границы нарушены в нескольких местах. Наиболее опасны: проверка подписи не того update-артефакта, который реально выбирает `electron-updater`; запуск указанного renderer-процессом файла `java.exe`; гонки настроек, способные вернуть отключённую телеметрию; потеря владения дочерними процессами при отмене; утечка логов между аккаунтами на одном устройстве.

| Уровень | Количество |
|---|---:|
| Critical | 0 |
| High | 5 |
| Medium | 18 |
| Low | 10 |
| **Всего** | **33** |

## Охват и методика

Проверены все исходники main/preload/renderer, сервисы загрузки и запуска, IPC-контракты, stores/hooks/components, тесты, скрипты подписи, конфигурация сборки, CI, package manifests и локальная `.codex/config.toml`. Для критичных предположений дополнительно проверено поведение зафиксированного `electron-updater@6.8.9`. Сгенерированные `dist*` и весь сторонний `node_modules` не ревьюились построчно.

Анализ включал моделирование компрометации renderer, update-канала, удалённого HTTP-ответа, локального общего устройства, сбоев ФС и конкурентных действий пользователя. Реальный E2E-запуск Minecraft не выполнялся: он скачивает внешние артефакты, использует реальные сервисы и запускает сторонний JVM-код.

## Подтверждённые проверки

| Проверка | Результат |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 14 файлов, 95 тестов |
| `npm run build:web` | PASS |
| `npm audit --omit=dev --json` | 1 High runtime-пакет: `js-yaml@4.2.0` |
| `npm audit --json` | 26 уязвимых узлов: 2 Critical, 20 High, 4 Moderate; преимущественно dev/build |
| Поиск сигнатур секретов в текущих файлах и git history | Реальных секретов не найдено |

`Semgrep`, `Gitleaks` и `Trivy` в окружении отсутствовали. Их отсутствие компенсировано ручным анализом trust boundaries и точечным поиском опасных API/секретов, но не считается эквивалентом полноценного SAST/SCA-пайплайна.

## High

### ADV-001 — Проверяется не тот update-артефакт, который затем устанавливается

**Где:** `electron/services/UpdateTrust.ts:78-85`, `electron/services/UpdateService.ts:55-69`, `electron/services/UpdateService.ts:90-95`, `electron/services/UpdateService.ts:124-127`  
**Класс:** CWE-345, CWE-494; ориентировочно CVSS 7.5  
**Уверенность:** высокая

`matchesUpdateCandidate()` принимает update, если **любой** файл из `latest.yml` совпадает с подписанной записью (`some`). Зафиксированный `electron-updater@6.8.9` независимо выбирает подходящий по архитектуре либо первый `.exe`. `downloadUpdate()` и `update-downloaded` связаны с доверенным манифестом только по версии, а не по точному tuple `url/name + sha512 + size + arch`.

Сценарий: атакующий, способный заменить release metadata, но не владеющий Ed25519-ключом, добавляет один настоящий подписанный файл и второй вредоносный файл, который выберет updater. Проверка проходит по первому, скачивается второй, его SHA берётся из того же неподписанного `latest.yml`, а пользователь получает предложение установить его.

**Исправление:** подписывать каноническое update metadata целиком либо сначала детерминированно выбрать артефакт и проверять подпись именно его полного tuple. Запрещать неоднозначные/лишние кандидаты, сбрасывать trusted state при любом расхождении, добавить Authenticode/publisher validation. Нужен негативный тест: подписан второй файл, updater выбрал первый — установка обязана блокироваться.

### ADV-002 — Компрометированный renderer может запустить произвольный нативный файл

**Где:** `electron/preload.ts:47-53`, `electron/ipc/handlers.ts:123-155`  
**Класс:** CWE-73, CWE-78; ориентировочно CVSS 7.8  
**Уверенность:** высокая

IPC `settings:verifyJava` принимает путь из renderer, проверяет только basename `java`/`java.exe` и передаёт путь в `spawn(..., ['-version'])`. Проверки `event.sender`, frame/origin, `realpath` и UNC-путей нет. Поэтому XSS/компрометация renderer превращается в native code execution через любой локальный или сетевой исполняемый файл с подходящим именем. Отсутствие `shell: true` не устраняет сам запуск выбранного файла.

**Исправление:** main-процесс должен сам получить путь из нативного dialog и хранить его как непрозрачный approved handle; renderer не должен возвращать произвольный путь для исполнения. Дополнительно проверять sender/frame URL, `realpath`, тип файла, UNC/network paths и ожидаемый Java binary. Добавить тесты на подменённый basename, symlink и UNC.

### ADV-003 — Lost-update гонка может незаметно вернуть согласие на crash reports

**Где:** `electron/services/SettingsService.ts:48-56`, `src/store/useSettingsStore.ts:44-53`, `src/components/SettingsModal.tsx:100-111`, `src/components/SettingsModal.tsx:232-249`, `src/components/SettingsModal.tsx:292-317`  
**Уверенность:** высокая

Каждый `settings:update` выполняет независимый read-modify-write всего объекта. Renderer отправляет параллельные запросы и заменяет store полным ответом в порядке завершения. Например, быстрое отключение crash reports и изменение памяти могут записаться из двух старых snapshots; более поздняя запись вернёт `crashReports: true`. Индикатор при этом способен показать «сохранено».

**Исправление:** сериализовать updates в main, применять patch к единственному in-memory snapshot, использовать revision/CAS и атомарный temp-file + rename. В renderer — очередь/debounce, счётчик pending, rollback/error state. Добавить детерминированный тест на переставленные ответы, отдельно для privacy opt-out.

### ADV-004 — Отмена теряет владение процессом и допускает перекрывающиеся запуски

**Где:** `electron/services/LauncherService.ts:163-201`, `electron/services/LauncherService.ts:204-272`, `electron/services/LauncherService.ts:325-355`, `electron/services/ForgeService.ts:212-240`  
**Уверенность:** высокая

`cancel()` прерывает только `DownloadService`, сразу очищает `currentProc` и публикует idle. Загрузки Mojang/Java и Forge installer не получают общий abort signal; завершение kill не ожидается. Пользователь может начать новый запуск, пока старый ещё меняет файлы или работает. Поздний `exit` старого процесса способен очистить handle уже нового процесса и отправить устаревшие события.

**Исправление:** ввести operation/session ID и явный state machine; один `AbortController` протянуть через все HTTP/ZIP/installer стадии; считать отмену завершённой только после закрытия ресурсов и процесса. Exit callback должен менять состояние только если он всё ещё владелец текущей сессии.

### ADV-005 — Логи и launcher-state протекают между аккаунтами

**Где:** `src/store/useAccountStore.ts:131-147`, `src/components/ProfileMenu.tsx:90-100`, `src/store/useLogStore.ts:26-43`, `src/App.tsx:61-113`  
**Уверенность:** высокая

Logout очищает account/offline identity, но не log store, launcher store, subscriptions и текущий route. На общем компьютере пользователь A может выйти на `/logs`, после чего пользователь B войдёт и увидит до 5000 строк логов A, включая ник, чат, локальные пути и диагностические данные.

**Исправление:** единый session teardown должен отписать listeners, очистить чувствительные stores, сбросить launcher state и перевести на безопасный route до показа новой сессии. Добавить интеграционный сценарий A → logs → logout → B.

## Medium

### ADV-006 — Повторное открытие окна на macOS оставляет сервисы привязанными к уничтоженному окну

**Где:** `electron/main.ts:140-168`, `electron/main.ts:178-184`  
После закрытия последнего окна на macOS приложение не завершается, но update timer очищается. `activate` создаёт окно, не вызывая повторно `updater.attach()`/`launcher.attach()` и не запуская timer. Прогресс/логи/update events уходят в старый `webContents`, обновления больше не проверяются. **Исправление:** централизовать bind/unbind окна и scheduler; вызывать при каждом создании окна, проверять `isDestroyed()`, добавить macOS lifecycle test.

### ADV-007 — Неограниченный I/O позволяет повесить запуск или заполнить диск

**Где:** `electron/services/DownloadService.ts:93-160`, `electron/services/MojangService.ts:201-247`, `electron/services/JavaService.ts:190-259`, `electron/services/ForgeService.ts:212-240`, `electron/services/AccountService.ts:98-118`  
У потоков нет абсолютных/idle timeout, общего cancellation и лимита redirect; размер download проверяется только после EOF. Медленный либо бесконечный ответ блокирует launch, а oversized body сначала полностью записывается. **Исправление:** timeout/deadline, bounded redirects, проверка `Content-Length` и счётчик фактических bytes до записи сверх лимита, AbortSignal во всех стадиях, cleanup temp files. CWE-400.

### ADV-008 — Реальный access token остаётся в постоянном `launch-args.txt`

**Где:** `electron/services/LauncherService.ts:275-323`, `electron/services/MinecraftService.ts:124-165`  
Yggdrasil token попадает в фиксированный argfile в каталоге Minecraft; файл не удаляется и права доступа явно не ужимаются. Локальный пользователь, backup или diagnostic bundle может извлечь активный токен. **Исправление:** краткоживущий случайный файл с user-only permissions, cleanup на success/error/cancel/startup recovery; по возможности избегать долговечного token-on-disk и гарантировать redaction. CWE-312/CWE-522.

### ADV-009 — Logout сообщает успех, даже если секрет не удалён с диска

**Где:** `electron/services/AccountService.ts:66-87`, `electron/services/AuthService.ts:58-63`, `electron/ipc/handlers.ts:238-244`, `src/store/useAccountStore.ts:131-147`  
Ошибки удаления session-файлов проглатываются, global logout является best-effort, а account state публикуется до успешной записи. После EACCES/сбоя ФС старая сессия может восстановиться после перезапуска, хотя UI показал выход. **Исправление:** durable-first transition, явный partial-failure result, retry/quarantine и проверка отсутствия секрета до success.

### ADV-010 — Синтаксически валидный, но семантически битый cache создаёт постоянную петлю отказа

**Где:** `electron/services/MojangService.ts:135-177`, `electron/services/ForgeService.ts:141-164`, `electron/services/LauncherService.ts:286-297`  
`{}` принимается как cached manifest; Forge cache и существующий authlib jar также доверяются без полной schema/hash validation. Ошибка повторяется на каждом старте, потому что cache не инвалидируется. **Исправление:** runtime schemas, hash/size checks, atomic write, quarantine/delete on parse or semantic failure.

### ADV-011 — Account client принимает malformed/truncated 2xx как успешный ответ

**Где:** `electron/services/AccountService.ts:90-118`, `electron/services/AccountService.ts:135-145`  
Некорректный JSON превращается в `{}`, нет строгой схемы, response-size cap и полного набора `aborted`/premature-close обработчиков. Это способно отравить volatile session и дать ложный успех. **Исправление:** ограничить bytes, требовать complete response, валидировать status/content-type/schema и публиковать session только после durable save.

### ADV-012 — Событие о скачанном security update теряется при login/logout

**Где:** `src/App.tsx:61-113`, `src/components/UpdateToast.tsx:37-73`  
Guest и authenticated branches монтируют разные `UpdateToast`; downloaded state локален и событие одноразовое. Переход auth размонтирует уведомление, и готовое обновление может больше не предлагаться. **Исправление:** один persistent component/store и replayable main state (`getDownloadedUpdate`).

### ADV-013 — Кнопка Play снова активна во время игры и ломает подписку на exit

**Где:** `src/store/useLauncherStore.ts:50-87`, `src/components/PlayButton.tsx:24-33`  
На стадии `running` `isLaunching` становится false. Повторный Play снимает старый listener, main отвечает `already running`, renderer показывает ошибку и теряет нормальное событие выхода. **Исправление:** отдельные `idle/preparing/running/stopping`, блокировка Play не только на preparation и стабильная подписка на весь lifecycle.

### ADV-014 — Видимые Java/JVM/close-on-launch настройки не применяются

**Где:** `electron/services/SettingsService.ts:8-13`, `src/components/SettingsModal.tsx:190-257`, `electron/services/LauncherService.ts:303-322`  
UI сохраняет `javaMode`, `javaPath`, `jvmArgs`, `closeOnLaunch`, но launch pipeline их игнорирует. Пользователь получает ложное ощущение контроля, в том числе над JVM-флагами. **Исправление:** либо применить и валидировать настройки, либо удалить controls до реализации; добавить launch-argument contract tests.

### ADV-015 — Username-login с `email_unverified` попадает в тупик

**Где:** `src/store/useAccountStore.ts:88-103`, `src/components/AuthGate.tsx:18-30`  
`pendingEmail` записывается только если login содержит `@`; verification UI зависит от него. Для username login серверная ошибка не даёт пути resend/verify. **Исправление:** сервер должен возвращать нормализованный verification target/flow ID, а UI — переключаться по typed error, не по форме ввода.

### ADV-016 — ZIP extraction не завершает все error/reject paths

**Где:** `electron/services/JavaService.ts:269-301`, `electron/services/LauncherService.ts:435-474`  
У entry input streams нет полного error/pipeline handling; при unsafe entry promise отклоняется без гарантированного закрытия zip и settled guard. Возможны зависание, незакрытые handles и частичная установка. **Исправление:** `stream.pipeline`, единый once-settlement, `zip.close()` и temp-dir rollback на каждом отказе.

### ADV-017 — Runtime YAML parser и build toolchain содержат известные advisories

**Где:** `package-lock.json:6721`, `package.json:21-44`  
Runtime-путь фиксирует `js-yaml@4.2.0`, который `electron-updater` использует для удалённого `latest.yml`; `npm audit --omit=dev` отмечает [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) и [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) (quadratic CPU DoS). Полный graph дополнительно содержит 2 Critical/20 High/4 Moderate в dev/build цепочке. **Исправление:** зафиксировать `js-yaml >=4.3.1` через совместимое обновление updater/override, обновить Vitest/Vite/electron-builder stack и разделить CI gates для runtime и build dependencies.

### ADV-018 — Windows/macOS релизы не имеют обязательной платформенной подписи

**Где:** `electron-builder.yml:16-43`, `.github/workflows/release.yml:90-135`  
В конфигурации нет обязательного Windows publisher/certificate, macOS identity явно null; workflow публикует полученные артефакты. Ed25519-манифест не заменяет Authenticode/notarization для первого install и OS trust UI. **Исправление:** подписывать Windows artifacts, Developer ID + notarization на macOS, fail build when signing secrets absent, проверять подпись перед publish/install.

### ADV-019 — «Анонимный» crash report отправляет сырые логи без redaction

**Где:** `electron/services/CrashReportService.ts:38-49`, `src/components/SettingsModal.tsx:31-32`, `src/components/Onboarding.tsx:111-123`  
В payload входят raw error message и до 300 строк логов, где возможны ники, chat, локальные пути и token-like data. Текст UI обещает анонимность. **Исправление:** allowlist полей, централизованный redactor, запрет chat/args/tokens, preview payload и canary tests на секреты/пути.

### ADV-020 — Локальный MCP стартует непинованный npm-код

**Где:** `.codex/config.toml:1-14` (untracked local config)  
`npx -y ruflo@latest` скачивает и исполняет текущий latest package при запуске tooling. Компрометация пакета/аккаунта либо неожиданное обновление получает права разработчика. **Исправление:** pin точную проверенную версию и lock/integrity, обновлять её отдельным review-процессом; не использовать auto-confirm для плавающей версии.

### ADV-021 — Offline server показывается зелёным и «Excellent»

**Где:** `src/components/Sidebar.tsx:92-106`, `src/components/ServerInfo.tsx:65-74`, `src/components/TitleBar.tsx:28-34`  
Часть UI игнорирует `status.online` и продолжает показывать healthy state. Это операционно вводит пользователя в заблуждение и скрывает реальный outage. **Исправление:** единая derived health model с `unknown/offline/degraded/online`, используемая всеми компонентами.

### ADV-022 — Settings разрешает отдать JVM всю системную RAM

**Где:** `src/components/SettingsModal.tsx:145-187`, `src/components/Onboarding.tsx:10-15`  
Onboarding оставляет резерв и ограничивает выбор, но Settings позволяет максимум, равный всей памяти. Запуск способен вызвать severe swapping/OOM. **Исправление:** единая политика резерва ОС, cap и предупреждение; повторная валидация в main перед формированием JVM args.

### ADV-023 — Конфигурация и публичный Play API не являются источником истины

**Где:** `src/config/brand.config.ts:1-12`, `src/store/useLauncherStore.ts:8-11`, `src/store/useLauncherStore.ts:82-87`, `electron/services/LauncherService.ts:303-317`  
Версия/loader/social links частично hardcoded, а переданные `PlayOptions.memory`/`loader` фактически заменяются settings/prefix logic. E2E может утверждать, что тестирует 2048 MB, хотя запускается другое значение. **Исправление:** один validated launch config, передаваемый end-to-end; удалить дубли и assert фактические args в тестах.

## Low

### ADV-024 — В frameless окне до входа нет TitleBar

**Где:** `electron/main.ts:17-23`, `src/App.tsx:61-70`  
До authentication отсутствуют drag/minimize/maximize/close controls. Добавить общий TitleBar или доступную системную альтернативу для guest flow.

### ADV-025 — «Изменить ник» не меняет отображаемый/запускаемый аккаунт

**Где:** `src/components/ProfileMenu.tsx:67-87`, `src/store/useLauncherStore.ts:82-87`  
Control меняет offline state, но authenticated username остаётся источником display и launch. Скрыть действие для online account либо реализовать отдельный корректный режим.

### ADV-026 — Legacy Mojang native classifiers не поддержаны

**Где:** `electron/services/MojangService.ts:25-32`, `electron/services/LauncherService.ts:360-404`  
Старый формат `classifiers/natives-*` объявлен в типах, но не скачивается/не распаковывается. Текущая фиксированная 1.21.1 обычно использует отдельные artifacts, однако заявленная 1.20.1 Forge compatibility делает дефект реальным при расширении версий. Добавить resolver обоих форматов и fixtures.

### ADV-027 — Mojang rules игнорируют `os.arch`

**Где:** `electron/services/MojangService.ts:66-87`  
Rules фильтруются по OS name/features, но не architecture, поэтому x86-only args могут попасть в x64/arm64 launch. Нормализовать arch и покрыть fixtures.

### ADV-028 — Логические строки режутся по границам stream chunks

**Где:** `electron/services/MinecraftService.ts:202-209`, `electron/services/ForgeService.ts:224-235`  
Каждый chunk сразу split по newline без сохранения хвоста. Логи и E2E markers могут распасться или склеиться. Использовать readline/StringDecoder с tail buffer.

### ADV-029 — Support `mailto:` гарантированно отклоняется main-процессом

**Где:** `src/pages/SupportPage.tsx:6-10`, `src/pages/SupportPage.tsx:40-43`, `electron/ipc/handlers.ts:161-168`  
UI вызывает `mailto:`, allowlist разрешает только HTTP(S). Либо явно разрешить и валидировать `mailto`, либо показывать копируемый адрес.

### ADV-030 — Английская локализация неполна

**Где:** `src/components/Onboarding.tsx`, `src/components/TwoFactorForm.tsx`, `src/store/useLauncherStore.ts`, `index.html`  
Часть operational/error text остаётся русской, `lang="ru"` фиксирован. Перенести все строки в i18n и синхронизировать document language.

### ADV-031 — News metadata устаревает и ссылается на отсутствующие assets

**Где:** `electron/services/NewsService.ts:13-41`, `public/`  
Даты захардкожены, пути `/news/*.jpg` отсутствуют. Сейчас cards почти не используют image, поэтому дефект частично скрыт. Добавить asset validation и реальный источник/сборочную проверку.

### ADV-032 — Не объявлен минимальный Node, требуемый lockfile

**Где:** `package.json:1-45`, `package-lock.json:8369-8403`  
`react-router@7.17.0` требует Node `>=20`, но root `engines` отсутствует. На Node 18 установка с engine-strict падает. Зафиксировать Node в `engines`, `.nvmrc`/toolchain и CI.

### ADV-033 — Критичный orchestrator слишком велик, renderer почти не покрыт поведением

**Где:** `electron/services/LauncherService.ts` (583 строки), `src/lib/__tests__/validators.test.ts`  
Файл превышает локальное правило 500 строк и соединяет download/install/process/event state; существующие 95 тестов проходят, но renderer stores/hooks/components почти не тестируются. Разделить orchestration/state adapters и добавить race/lifecycle/session tests.

## Что сделано хорошо

- `BrowserWindow` использует `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; CSP существенно ограничивает renderer.
- Renderer получает типизированный `contextBridge`, прямого Node API, `eval` и явных HTML injection sinks не найдено.
- Сессия аккаунта использует `safeStorage`, а внешние URL и часть IPC inputs имеют allowlists/validators.
- Для игровых артефактов есть hash checks, для ZIP — базовая защита от path traversal.
- Есть Ed25519 update manifest и отдельный signing script: направление верное, ошибка находится именно в binding выбранного файла.
- Strict TypeScript, lint, build и 95 тестов проходят на проверенной ревизии.

## Приоритет исправлений

1. До следующего релиза: ADV-001, ADV-002, ADV-003, ADV-004, ADV-005.
2. Затем одним reliability/security циклом: ADV-007, ADV-008, ADV-009, ADV-010, ADV-011, ADV-016, ADV-017, ADV-018, ADV-019.
3. Добавить обязательные regression tests: multi-file update selection; concurrent settings; cancel→relaunch; account A→logout→B; macOS close→activate; stalled/oversized/redirecting HTTP; corrupt caches.
4. После исправлений повторить SCA/SAST, подписанную release-сборку и реальный launch smoke-test в изолированной disposable-среде.

## Итоговое решение

**Request changes.** Успешные тесты подтверждают текущие happy paths, но не закрывают adversarial сценарии на границах renderer↔main, update metadata↔artifact, UI↔durable state и cancel↔process lifecycle. Выпуск следует разблокировать после устранения пяти High и повторного целевого ревью их исправлений.
