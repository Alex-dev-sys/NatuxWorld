# NatuxWorld: полный перенос лаунчера на Tauri 2 + Rust

Дата обновления: 13 октября 2026 года. Статус: большая часть локальной реализации Tauri/Rust готова; cutover и релизная приёмка ещё не выполнены. В свежей проверке прошли root `npm run lint`, `npm run typecheck`, `npm test` (161), release-workflow (10) и bridge/feed/lock contracts (9), Rust fmt/clippy и `cargo test` (194 passed, 2 ignored; updater verifier 1 passed). Tauri NSIS пересобран (6.05 MiB), packaged smoke прошёл (1), установленный пакет и uninstall/profile rollback прошли (2); Electron rollback собран без подписи и packaged smoke прошёл (1). Windows safeStorage interop прошёл (2). Website source в этом прогоне не менялся; последняя отдельная проверка завершилась 204 тестами и успешными lint/typecheck/build. Сравнительный Windows x64 baseline уже собран; другие ОС и чистая Windows без WebView2 не проверены.

Поведение закрытия во время запуска теперь сохраняет Electron-паритет: Tauri скрывает окно, продолжает мониторинг игры и завершает приложение после завершения активного pipeline; повторное открытие отменяет отложенный выход. Тестовая staging-инфраструктура существует, но текущая проверка показывает `eula=false`, пустой whitelist и закрытый `127.0.0.1:25567`; нет отдельного тестового аккаунта без 2FA и отдельной Windows-учётной записи, поэтому live login/join не запускался. GitHub Actions всё ещё показывает последний Build от 9 сентября на старом commit `9fefa8c`; миграционные workflow ещё не запускались. Настроены secrets `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY`; release variables отсутствуют. Пользователь сообщил, что покупать сертификаты Windows/macOS не будет из-за цены. Теперь CI допускает Tauri updater release без этих сертификатов: подписи обновления остаются обязательными, а подпись ОС и macOS notarization — необязательными. Первая установка будет требовать ручного подтверждения предупреждений Windows/macOS. Локальный unsigned пакет пока не является релизным артефактом; live game acceptance и upgrade/rollback остаются открытыми, Electron сохранён для отката.

Документ составлен по текущему исходному коду NatuxWorld и официальной документации из интернета. Ссылки на источники находятся в последнем разделе. Локальная сборка и запуск Tauri executable не подтверждают совместимость установщика/обновлений, полный перенос пользовательских данных, feature parity или production-инфраструктуру.

## 1. Цель и границы переписывания

Полностью заменить нативную часть Electron-лаунчера на Rust + Tauri 2, сохранить внешний вид и пользовательские сценарии React-интерфейса, перенести установку и запуск игры, аккаунты, настройки и обновления. В итоговом desktop-пакете не должно остаться Electron или отдельного Node.js-процесса для прежних служб.

| Часть проекта | Итоговый стек | Объём работы |
|---|---|---|
| Desktop-оболочка | Tauri 2 + Rust | Переписать main/preload/IPC, жизненный цикл окна и системные интеграции |
| Нативные службы лаунчера | Rust | Переписать загрузки, Java, Minecraft, Forge, аккаунты, хранение, диагностику, обновления |
| Интерфейс лаунчера | React + TypeScript + Vite + Zustand | Сохранить компоненты; заменить bridge, связанные типы и платформенные детали |
| Сайт, API, магазин, админ-панель | Next.js + TypeScript | Сохранить; адаптировать только обнаруженные контракты и выдачу новых desktop-артефактов |
| База сайта | PostgreSQL + Prisma | Сохранить; смена desktop runtime не требует переноса БД |
| Серверный плагин Minecraft | Java 21 + Paper API | Сохранить; проверить совместимость входа и серверных интеграций |

«Полностью» означает полный перенос функций лаунчера, а не замену каждого языка в репозитории на Rust. Node.js остаётся инструментом сборки frontend и runtime сайта. Java остаётся runtime игры, Forge installer и Paper-плагина.

Основание выбора: Tauri допускает существующий веб-интерфейс и использует системный WebView, что позволяет уменьшить размер desktop-пакета. Конкретные память, скорость и объём первой установки определяются измерениями; отсутствие встроенного браузера само по себе не гарантирует заданного выигрыша. [Tauri][tauri], [WebView по ОС][webview].

## 2. Что уже существует и должно попасть в перенос

Проверенная структура: `src/` — renderer; `electron/` — нативная логика; `website/` — отдельный сайт; `website/natux-plugin/` — Java-плагин. Корневой `package.json` содержит версию лаунчера `1.9.15`; это версия в исходниках, не подтверждение установленного у пользователей релиза.

- Интерфейс использует React, Zustand, HashRouter и Framer Motion. В `src/` нет прямых runtime-импортов Electron/Node, но есть зависимость типов от `electron/services/`.
- Фасад `src/services/electron-bridge.ts` предоставляет `NatuxAPI`; полный контракт находится в `src/types/electron.d.ts`, `electron/preload.ts` и `electron/ipc/handlers.ts`. Одного `channels.ts` для инвентаризации недостаточно.
- Есть регистрация, подтверждение e-mail, вход, 2FA, локальный и глобальный выход, получение игровой сессии и Yggdrasil/authlib-injector.
- Есть установка Java, Minecraft и Forge, прогресс, отмена, вывод логов, защита от параллельного запуска, восстановление состояния и учёт времени игры.
- Есть настройки, новости, статус сервера, диагностика, opt-in отчёты о сбоях и телеметрия, опциональный Discord RPC.
- Windows-обновления имеют собственный подписанный манифест, проверку артефакта и staged rollout. macOS-обновления сейчас ручные.
- CI упаковывает Windows x64 и macOS x64/arm64. Linux AppImage указан в Electron-конфигурации, но отдельного Linux release/test job в текущем workflow нет.
- Трей в текущей реализации отключён на macOS. Автозапуск реализован для Windows/macOS; новые платформенные возможности требуют своей приёмки.

Следующие возможности не считать уже работающими: установка Fabric/NeoForge, менеджер модпаков/Modrinth/CurseForge, применение пользовательских `javaPath`/`jvmArgs` к запуску. В нынешнем коде Fabric/NeoForge переходят к vanilla, а custom Java/JVM поля сохраняются, но не используются pipeline. Сохранять пользовательские `mods`, `config`, `saves` и другие файлы обязательно; создавать новый менеджер модов в рамках паритета не требуется.

## 3. Целевая архитектура

```text
React UI / Zustand / HashRouter
            |
     типизированный native bridge
            |
  Tauri commands / channels / events
            |
      Rust application state
            |
  account | settings | downloads | Java | Forge | Minecraft
  updater | migration | diagnostics | playtime | reporting
            |
   ОС / HTTPS API существующего сайта / внешний Java-процесс
```

Rust становится владельцем файлов, процессов, сессии аккаунта и состояния операции установки/запуска. React отображает данные и передаёт пользовательские намерения. Ресурсы интерфейса входят в пакет; удалённые страницы магазина и поддержки открываются во внешнем браузере.

Базовые зависимости: Tauri 2; `serde`/`serde_json` для DTO; Tokio для I/O, процессов и координации; `reqwest` для HTTP. Библиотеки хеширования, архивов и системного хранилища выбрать после проверки нужных API, лицензий, платформ и поддерживаемого Rust. Не добавлять отдельную БД в лаунчер без выявленной необходимости. [Tokio][tokio], [reqwest][reqwest].

Для Tauri plugins подключать только необходимые функции: native dialog, opener, single-instance, tray и autostart; updater подключать в отдельном релизном этапе после выбора feed и управления ключом подписи. Файлы и запуск игры доступны через специализированные Rust commands, без общего frontend-доступа к shell/FS. [Dialog][dialog], [Opener][opener], [Single Instance][single-instance], [System Tray][system-tray], [Autostart][autostart].

### Размещение файлов

| Путь | Назначение |
|---|---|
| `src/components/`, `src/pages/`, `src/store/` | Существующий интерфейс и состояние UI |
| `src/services/native-bridge.ts` | Будущее нейтральное имя существующего bridge после смены реализации |
| `src/types/native.ts` | Общий контракт frontend/native без импортов из Electron |
| `src/native/Cargo.toml`, `Cargo.lock`, `build.rs`, `tauri.conf.json` | Новый Rust/Tauri crate; все эти файлы внутри `src/native/` |
| `src/native/src/commands/`, `services/`, `models/` | Тонкие команды, бизнес-логика и DTO |
| `src/native/capabilities/`, `permissions/` | Разрешения окон и команд |
| `src/native/tests/` | Rust integration tests и синтетические fixtures |
| `config/` | Публичная конфигурация бренда и настройки тестовой сборки |
| `scripts/` | Запуск Tauri CLI, генерация конфигурации, release/preflight |
| `tests/e2e/` | Проверки packaged UI и отдельный live acceptance |

Использовать `src/native/`, чтобы соблюдать размещение рабочих файлов из `AGENTS.md`. CLI поддерживает нестандартную структуру через `TAURI_APP_PATH` и `TAURI_FRONTEND_PATH`. Wrapper в `scripts/` вычисляет абсолютные пути относительно репозитория и запускает локальный CLI. Пути конкретного компьютера в конфигурацию не записывать. [Custom project structure][custom-paths].

Разбивать Rust и TypeScript исходники на модули до 500 строк. Команды валидируют и вызывают службы; бизнес-логика не должна собираться в одном `lib.rs` или универсальном IPC handler.

### Сборка и версии

Зафиксировать совместимые версии Rust toolchain, Tauri core/CLI/API/plugins в manifests и lockfiles. Текущая документация updater указывает Rust не ниже 1.90; это минимум данного plugin, не рекомендация бесконтрольно обновлять все зависимости. Проверить требования выбранных версий перед первым PR. [Updater][updater].

Tauri hooks должны запускать только frontend: отдельный `dev:web` с Vite и `build:web` с TypeScript/Vite. Desktop `dev/build` не должны вызывать себя через hooks. Для `src/native/` настроить `frontendDist: "../../dist"`, `devUrl: "http://localhost:5173"`, фиксированный Vite port и `strictPort: true`. В этапе E1 проверить эту схему в реальной сборке. [Vite integration][vite].

Во время переноса добавить отдельные `dev:tauri`/`build:tauri`, сохранив проверяемую Electron-сборку. После приёмки переключить стандартные команды на Tauri. Node.js sidecar не использовать как конечную реализацию прежних служб.

## 4. Карта переписывания существующих модулей

Все пути в первом столбце относятся к текущему каталогу `electron/`. Последний столбец описывает обязанности будущего модуля, а не готовые API сторонней библиотеки.

| Текущий модуль | Будущий Rust/Tauri модуль | Что сохранить |
|---|---|---|
| `main.ts`, `preload.ts`, `ipc/handlers.ts` | `app`, `commands`, TS bridge | Окно, жизненный цикл, полный NatuxAPI, валидация и отписки |
| `utils/renderer-protocol.ts` | Bundled assets + Tauri CSP/capabilities | Ограничение ресурсов и навигации, отсутствие Node в renderer |
| `services/LauncherService.ts` | `launcher` | Один pipeline, стадии, disk gate, отмена, запрет параллельного PLAY |
| `services/MojangService.ts` | `metadata` | Version/asset manifests, кеш, хеши, OS/feature rules, подстановка аргументов |
| `services/LauncherResources.ts` | `resources`, `archives` | Libraries/assets/natives, дедупликация, разделение ОС/архитектур |
| `services/DownloadService.ts` | `downloads` | Потоковая запись, очередь, resume, retries, контроль размера/хеша, атомарная готовность |
| `services/JavaService.ts` | `java` | Managed/system Java, Temurin 21, probe, архитектуры, SHA-256, распаковка |
| `services/ForgeService.ts` | `forge` | Проверенный installer, `--installClient`, patched JAR, отмена и cache validation |
| `services/MinecraftService.ts` | `minecraft`, `processes` | Classpath, JVM/game args, quickPlay, authlib, argfile, stdout/stderr/exit |
| `services/AccountService.ts` | `account`, `secrets` | Website API, 2FA, bootstrap/offline, game-session, безопасное хранение |
| `services/AuthService.ts` | `identity` | Совместимый offline UUID; legacy identity не заменяет авторизованную игровую сессию |
| `services/SettingsService.ts`, `utils/paths.ts` | `settings`, `paths`, `migration` | Схема, сериализация записи, пользовательские данные, стабильный installId |
| `services/NewsService.ts`, `LauncherServerService.ts` | `public_api` | Новости, cache/fallback, статус сервера и существующие ограничения DTO |
| `services/DiagnosticsService.ts` | `diagnostics` | Java/disk/RAM/network/version probes и понятные результаты |
| `services/PlaytimeService.ts` | `playtime` | Локальная статистика, heartbeat, восстановление после сбоя, отсутствие races |
| `services/CrashReportService.ts`, `TelemetryService.ts` | `reporting` | Отдельные opt-in, redaction, caps, best-effort отправка |
| `services/DiscordRpcService.ts` | `discord` | Опциональность, clear/destroy, отсутствие влияния сбоя Discord на игру |
| `services/UpdateService.ts`, `UpdateTrust.ts` | `updates`, `update_policy` | Проверка доверия, channel/rollout, переход пользователей и установка |
| Release-скрипты, `electron-builder.yml`, `.github/workflows/build.yml` | Tauri packaging/release/preflight | Подписи ОС, полные артефакты, отдельная публикация после проверок |
| `tests/e2e/packaged*.cjs` | Новый native/packaged harness | Реальный бинарник, отдельный профиль, очистка процессов, game join acceptance |

`scripts/create-school-project-doc.cjs` не относится к desktop runtime. Его переписывание не требуется.

## 5. Контракт frontend/native и пользовательское поведение

1. Перенести DTO из `src/types/electron.d.ts` и сервисов в нейтральный контракт. Сохранить формы `AccountResult`, `BootstrapResult`, `LoginOutcome`, `LaunchProgress`, `LauncherSettings` и `UpdateEvent`. Изменения схемы делать явно и проверять контрактными fixtures Rust/TS.
2. Сохранить группы `window`, `launcher`, `auth`, `java`, `news`, `server`, `settings`, `updater`, `shell`, `app`, `account`. На первом этапе менять транспорт, сохраняя вызывающий код UI.
3. `invoke` использовать для запросов/ответов; channels — для упорядоченного прогресса и логов; events — для небольших уведомлений окна/трея. Долгие операции выполнять асинхронно. [Calling Rust][commands], [Calling the Frontend][frontend].
4. Инициализировать transport и подписки до первого PLAY. Текущий фасад возвращает синхронную функцию отписки, а Tauri `listen` асинхронен: простая замена приводит к потере первых событий. Рекомендуемый вариант — заранее подготовленный transport и синхронный локальный dispatcher.
5. Cleanup должен работать при размонтировании до завершения native subscribe. React StrictMode не должен создавать двойные подписки. После восстановления WebView получать snapshot реального состояния Rust, а не угадывать его по последнему UI событию.
6. Идентифицировать операции `launchId` и последовательностью сообщений. Событие отменённого запуска не должно менять новый запуск. Ограничивать частоту прогресса и объём batch логов; сохранить UI лимит последних 5000 строк.
7. Production при отсутствии native bridge показывает ошибку и запрещает PLAY. Имеющийся browser fallback с фиктивно успешными Java/play/status оставить только в явно включённом dev/test preview.
8. Сохранить login/2FA, onboarding, ru/en, settings, новости, диагностику, логи, playtime и UpdateToast до входа. Сохранить HashRouter и существующее визуальное оформление.
9. Перенести `-webkit-app-region` на Tauri drag regions/оконные API. Проверить titlebar, maximize/restore, focus, clipboard, DPI, размер окна и попадание мыши в кнопки на каждой целевой ОС. [Window customization][window].
10. Сохранить различие `isLaunching`/`isRunning`, retry/cancel и событие выхода Java. `running` означает наличие процесса, а не доказанный вход на сервер.

## 6. Установка и запуск Minecraft/Forge

Pipeline: разрешение профиля → проверка места → Java → metadata → libraries/assets → natives → Forge → игровая сессия → запуск → наблюдение за процессом → завершение и очистка. Проверить действительные зависимости этапов по текущему orchestrator и не сохранять токен дольше необходимого.

- Сохранить Forge-профили из текущего кода: Minecraft 1.21.1/Forge 52.1.14, 1.21.6/56.0.4 и 1.20.1/47.4.20. Не менять версии игры одновременно с переносом runtime. Основной UI сейчас запускает `forge-1.21.1`.
- Сохранить установку через официальный внешний Forge Java installer; переписывать Forge processors самостоятельно не требуется. Готовность кеша подтверждать version JSON и валидным patched client JAR.
- Сохранить смысл Mojang rules, inheritance/merge, classifiers, assets и natives по существующим fixtures. Проверять version IDs, Maven coordinates, hash и size до построения путей.
- Для Java определить правильные OS/arch archive и путь: Windows, macOS `Contents/Home`, Unix executable permissions. Повторно выполнить probe после установки. Не путать architecture лаунчера, ОС и фактически запускаемого JVM.
- Загрузки писать потоково во временный файл; ограничить concurrency, сериализовать destination, поддержать отмену, deadlines/retries и корректный Range resume. После resume проверять полный итоговый файл; до проверки размера/хеша не помечать его готовым.
- Проверять каждый redirect и итоговый адрес по политике загрузчика; не допускать HTTPS→HTTP в production. Metadata и HTTP body имеют лимиты размера. Повреждённый ответ не должен становиться валидным кешем.
- Распаковка не выходит из destination: проверять traversal, абсолютные пути, symlinks, drive/UNC и размеры распакованных данных. Сохранять пользовательские файлы; очищать только собственные temporary paths.
- Запускать Java напрямую с аргументами, без shell. Для длинного classpath сохранить `@argfile`, экранирование, OS separator, поддержку пробелов и кириллицы. [Rust Command][process].
- Краткоживущий argfile с игровым токеном создавать с ограниченными правами; очищать на success/error/exit и при восстановлении после сбоя. Не выводить токен или полный секретный command line в UI, события, логи и отчёты.
- Получать реальный токен через текущий `/api/auth/game-session`, сохранять совместимость Yggdrasil и authlib-injector. Offline UUID вычислять совместимо с Java/сайтом; legacy token `"0"` не является разрешением на сетевой вход. [authlib-injector][authlib].
- Отмена прерывает загрузки/Forge installer и корректно завершает процессы данного задания. Process tree закрывается через Windows Job Object или Unix process group; regression test прошёл на Windows. Unix regression test добавлен, но ещё не запускался. Повтор после отмены и политику закрытия лаунчера при запущенной игре отдельно проверить.

## 7. Аккаунты и перенос пользовательских данных

### Аккаунт и секреты

Сохранить API существующего сайта: `/api/auth/register`, `/verify-email`, `/resend-code`, `/login`, `/login/2fa`, `/me`, `/logout`, `/game-session` и фактически используемые TOTP/backup-code методы. Проверять формы ответов, HTTP статус, timeout и ограничения body.

Account token принадлежит Rust backend; UI получает необходимые user/challenge/QR/backup-code данные, но не токен сессии. Пароль используется для запроса входа и не сохраняется. QR и backup codes показываются в соответствующем сценарии без отправки в логи или телеметрию.

Сохранить bootstrap-семантику: 401/403 аннулируют сессию; timeout/сеть/5xx дают `offline`, сохраняя известного пользователя. Это не обещает offline game launch: PLAY всё равно требует пригодную игровую сессию.

Предпочтение для постоянного хранения — системное защищённое хранилище через Rust adapter, проверенный на целевых ОС. При его недоступности — сессия только в памяти и явное сообщение о повторном входе после перезапуска. Открытый JSON с токеном и встроенный общий пароль хранилища запрещены.

Stronghold можно выбрать лишь с конкретной схемой получения, хранения и восстановления ключа. Он не является автоматической заменой Electron `safeStorage` и не расшифровывает старый `account.json` сам по себе. В базовом плане зашифрованная Electron-сессия не импортируется: после переноса остальных данных выполняется один повторный вход. Бесшовный импорт допускается только после отдельного доказательства по каждой ОС. [Stronghold][stronghold].

### Данные и миграция

Текущая основа — Electron `app.getPath('userData')`, внутри неё `settings.json`, `playtime.json`, `account.json`, `logs/`, `cache/`, `minecraft/`. В игровом каталоге — runtime, versions, libraries, assets, forge, legacy `auth.json`, screenshots и любые пользовательские файлы.

Tauri app identifier и его data path не обязаны совпасть со старым Electron userData даже при похожем имени. На E0 определить реальные старые пути на каждой ОС/для каждого способа установки; не использовать жёстко заданный путь одного разработчика.

| Данные | Правило переноса |
|---|---|
| Настройки и onboarding | Валидировать схему, перенести значения и пользовательские предпочтения |
| `installId`, update channel | Сохранить rollout bucket; reset не должен генерировать новую идентичность установки |
| `crashReports`, `telemetryEnabled` | Сохранить согласия; отсутствие поля не включает отправку |
| Playtime | Перенести статистику и восстановить оборванную сессию по heartbeat |
| Minecraft/Forge/Java cache | Перенести или безопасно повторно использовать; готовность проверять по metadata/hash |
| Saves, mods, config, screenshots, resourcepacks и другие пользовательские файлы | Сохранить без выборочного удаления; избежать конфликтов с новым профилем |
| `account.json` | Не расшифровывать/импортировать Electron ciphertext в Tauri; сохранять файл при запуске/установке для возможного Electron rollback, но удалять при явном локальном или глобальном выходе из Tauri, чтобы откат не восстановил завершённую сессию; при возврате пользователь входит повторно |
| Logs/cache | Переносить при необходимости с лимитами; ошибки кеша не уничтожают исходный профиль |

Миграция versioned и идемпотентная: обнаружение → dry run/место → резервная копия → staging → проверка → атомарное подтверждение → маркер завершения. Исходный профиль сохранять до успешной приёмки. При существующем Tauri-профиле не перезаписывать новые настройки и миры автоматически; показать понятный выбор либо остановить конфликтующий импорт.

Большой игровой каталог требует выбранной политики копирования/повторного использования и проверки свободного места. Не перемещать его рекурсивно без проверенных абсолютных границ. Во время импорта запретить конкурентную запись старого/нового лаунчера и активной игры; применять lock и контроль состояния.

## 8. Нативная безопасность и системные функции

- Ограничить commands локальным окном по label и определить app permissions. Зарегистрированные custom commands по умолчанию доступны окнам приложения; сам файл capabilities не делает их безопасными. Использовать manifest/permissions для явного списка. Разрешения нескольких capabilities складываются. [Capabilities][capabilities].
- В Rust проверять RAM/resolution, nickname/server, profile ID, пути, URL и состояние сессии. Общие `spawn(command)`, `read(path)`, `download(url,path)` для renderer не предоставлять.
- Выбор пользовательской Java разрешать через native picker с повторной canonical/realpath проверкой. Сохранить защиту от сетевых путей и подмены после выбора; сохранение поля не означает разрешение произвольного выполнения.
- Сетевые API origin, game profile, authlib version/hash и допустимые источники загрузок задавать доверенной публичной build-конфигурацией. Не давать frontend произвольно переопределять production origin.
- Настроить CSP для bundled scripts/assets, IPC, QR/data images и действительных нужд inline styles. Не загружать внешний JavaScript в привилегированное окно и не выдавать remote страницам native permissions. Проверить CSP именно в packaged build. [CSP][csp].
- Общую конфигурацию бренда получить из одного валидируемого публичного источника в `config/` с генерацией TS/Rust представлений. Согласовать `brand.config.ts`, будущий Rust config и `website/src/lib/brand.ts`; не дублировать домены вручную.
- Local/test HTTP разрешать только в явно собранном локальном режиме. Исключить devtools, тестовые WebDriver/IPC plugins и fixture overrides из production release.
- Сохранить window sizes, single-instance, close/minimize-to-tray, hidden startup с показом окна при отказе трея, автозапуск и живое применение настроек в рамках подтверждённых платформ.
- Внешние ссылки открывать через ограниченный opener после проверки scheme/host; screenshots открывать только из управляемого игрового каталога.
- Сохранить opt-in и redaction отчётов, ограниченный payload, deadlines и отсутствие account token в отправке. `installId` остаётся локальным rollout-идентификатором. Ошибка отправки не блокирует игру.
- Сохранить последовательный учёт playtime и crash recovery; сбой Discord не влияет на запуск. Не представлять HTTP roundtrip сайта как Minecraft ping или статические server-info поля как живые измерения.

## 9. Обновления, подписи и переход с Electron

Это самостоятельная часть переноса, обязательная до общего выпуска.

1. Использовать формат Tauri v2 `latest.json` с platform/arch URLs и Tauri-подписями. Для feed держать отдельные GitHub Release tags `tauri-stable-feed`/`tauri-beta-feed` с подписанным control JSON; версионный release хранит артефакты, `latest.json` и checksums. Electron `latest.yml`, `natux-update.json` и их ключи остаются самостоятельными и публикуются как прежде. [Tauri Updater][updater], [GitHub Releases pipeline][tauri-github], [Electron Auto Update][electron-updates].
2. Проверка подписи Tauri update artifact обязательна. Tauri public minisign key встроен в конфигурацию; отдельный `TAURI_SIGNING_PRIVATE_KEY` предназначен только для CI, его optional passphrase передаётся через `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Control JSON подписывается существующим Ed25519 `UPDATE_SIGNING_PRIVATE_KEY`. Секреты не добавлять в Git; сначала обеспечить резервную копию Tauri private key и план ротации.
3. Stable/beta, версию и rollout подписанного control-файла проверяет Rust до загрузки. Rollout использует прежний локальный `installId`, который не отправляется по сети. Подписанный `migrationEnabled` разрешает Electron показать ручной переход на Tauri даже при совпадающих версиях; отсутствующий флаг означает `false`. Версионный установщик выбирается по платформе и архитектуре, а ссылки берутся только из доверенного control.
4. Разделять hash установщика и hash установленного executable: текущая система проверяет оба в разных местах. Решить и проверить, какие прежние trust/self-integrity свойства покрыты новым updater, а какие требуют отдельного Rust module. SHA checksums сами по себе не заменяют подпись.
5. Подписи Tauri updater-артефактов обязательны и отдельны от платных сертификатов подписи ОС. `TAURI_UPDATES_ENABLED=true` может собирать и подписывать безопасный updater без Windows/macOS code-sign сертификатов; `CODE_SIGNING_ENABLED=true` включает необязательную Authenticode/Developer ID подпись и macOS notarization. Без сертификатов Windows может показать SmartScreen, а macOS потребует вручную разрешить запуск из Privacy & Security; ad-hoc подпись нужна для корректной упаковки Apple Silicon, но не снимает предупреждение Gatekeeper. [Windows signing][windows-signing], [macOS signing][macos-signing].
6. До изменения старого канала проверить переход из настоящей установленной Electron-версии: app identifier, installer/uninstaller, install scope, shortcuts, autostart, portable mode и userData. Возможность собрать новый NSIS installer не доказывает бесшовное обновление.
7. Базовый переход — Tauri installer с обязательной криптографической подписью updater-артефакта и понятным ручным переносом с сохранением данных. Подпись ОС — необязательная; при её отсутствии заранее показать инструкции по разрешению запуска на Windows/macOS. Electron-клиент может открыть версионный GitHub installer на основании подписанного control; установку запускает пользователь. Это не меняет electron-updater feed. Полностью автоматическую установку через последний Electron-релиз разрешать только после отдельного испытания bridge installer/feed на чистой машине.
8. Не заменять старый feed несовместимыми артефактами и не отзывать старый доверенный ключ до завершения перехода пользователей. Сохранить последние проверенные Electron installers для возврата.
9. Проверить Tauri→Tauri upgrade, отсутствие обновления, прерванную загрузку, подменённую подпись/артефакт, повторную попытку, сохранность данных и явное действие restart/install. Для macOS принять ручную ссылку на versioned Release; Linux добавлять в релизный охват только после появления пакета/feed и отдельной приёмки.
10. Для Windows выбрать NSIS, отдельно определить эквивалент текущего Portable. Не считать любой `.exe` автоматически проверенной portable-поставкой. macOS проверять для Intel и Apple Silicon. Linux публиковать только при наличии своей сборки и приёмки.

Выбрать WebView2 installation mode: bootstrapper требует доступной сети; offline/fixed runtime увеличивает поставку. Проверить новую установку на машине без WebView2 и отделять размер installer от полного сетевого объёма первой установки. Собирать и подписывать релиз на целевых ОС. [Windows installer][windows-installer], [Prerequisites][prerequisites].

## 10. Этапы, приоритеты и критерии завершения

P0 — блокирует безопасное начало/выпуск; P1 — основной перенос функций; P2 — улучшения после доказанного паритета. Готовность подтверждается перечисленными результатами, а не количеством переписанных файлов.

| Этап | Приоритет | Зависимости | Работа и результат | Критерий завершения |
|---|---|---|---|---|
| E0: исходная точка | P0 | Нет | Сохранить текущую ревизию и все локальные изменения, составить полный NatuxAPI inventory, paths/fixtures и метрики Electron | Проверяемая baseline-сборка, список функций/ограничений, изолированные test profiles; никакие чужие изменения не потеряны |
| E1: Tauri prototype | P0 | E0 | Создать crate/layout, pin toolchain, подключить renderer, window, минимальный command и packaged harness | Dev/build работают без рекурсивных hooks; реальное packaged окно открывается на Windows/macOS; риски WebView измерены |
| E2: контракт и transport | P0 | E1 | Нейтральные DTO, adapter, permissions, channels/events, snapshot и cleanup | Все NatuxAPI группы инвентаризированы; подписки готовы до PLAY; нет двойных listener, mock success в production и Electron type-imports в UI |
| E3: storage/account | P0 | E2 | Paths/settings, миграция, secret adapter, website account/2FA/game-session | Синтетический старый профиль переносится повторяемо; данные/consents сохранены; повторный вход работает; offline/401 различены |
| E4: download/Java/resources | P1 | E2, E3 для paths | Rust HTTP queue, metadata, archives, Java, assets/libraries/natives | Fixture regressions проходят; чистая установка Java/resources и отмена проверены на целевых ОС/arch |
| E5: Forge и реальная игра | P0 | E3, E4 | Installer, classpath/argfile, authlib/Yggdrasil, process owner и playtime | Реальный packaged путь login→install→PLAY→новая запись join на выделенном сервере; exit/cancel/retry не оставляют orphan processes |
| E6: полный UX/службы | P1 | E2–E5 | Settings UX, окно, tray/autostart, news/status, diagnostics, reporting, Discord | Таблица паритета закрыта; consent/redaction/lifecycle проверены; визуальная приёмка пройдена |
| E7: update/release migration | P0 | E1 ранний spike; E3–E6 для финала | Tauri feeds/keys/signing, CI, Electron→Tauri, Tauri→Tauri и rollback | Подписи updater проверены; установка/upgrade проверены на выбранных ОС; предупреждения неподписанной ОС понятны; старый канал совместим; release gate проверяет полный набор артефактов |
| E8: cutover и очистка | P0 | E0–E7 | Переключить стандартные scripts, удалить Electron runtime/config/deps, обновить текущие инструкции | Итоговый пакет не содержит Electron/Node sidecar; production проверки проходят; инструкции соответствуют Tauri |
| E9: оптимизация | P2 | E8 | Профилирование, настройка concurrency/UI/logging, уменьшение зависимостей | Улучшения подтверждены измерениями без потери функциональности |

Текущее состояние на 13 октября 2026 года:

- **E0 — частично выполнен.** Инвентаризация API, интерфейса и legacy-путей сделана. Для исходного baseline на одном Windows x64 host собраны версии 1.9.15: Electron NSIS installer — 106 785 307 bytes (101.84 MiB), Tauri NSIS — 6 168 196 bytes (5.88 MiB), то есть Tauri installer меньше на 94.22%. Размер самих каталогов приложения после unpack/install: Electron — 387 943 738 bytes (369.97 MiB, 76 файлов), Tauri — 21 714 884 bytes (20.71 MiB, 2 файла), разница 94.40%; сюда не входят профили пользователей, а в Tauri-замере — системный WebView2 runtime. Обновлённый `scripts/measure-desktop-baseline.cjs --iterations=20` запускал каждый упакованный runtime 20 раз в отдельном временном профиле. Медиана «процесс запущен → renderer и native bridge готовы» составила 1 096 ms для Electron (355–1 153 ms) и 527 ms для Tauri (510–579 ms). Сумма Working Set дерева процессов через 5 секунд: 349.5 MiB для Electron (344.7–379.8 MiB, 4 процесса) и 369.4 MiB для Tauri (367.4–372.0 MiB, 7 процессов). Медиана 12 вызовов чтения settings за запуск: 0.38 ms Electron и 0.93 ms Tauri. Это один Windows x64 host; время готовности включает установление CDP-соединения, а Working Set суммирует память дерева процессов и включает разделяемые страницы. Tauri показал меньший installer и каталог приложения, но в этом idle-замере потребил больше Working Set, а вызов bridge занял больше времени; общего выигрыша в памяти или отзывчивости не заявляется. macOS/другие ОС и чистая Windows без WebView2 не измерялись. Все процессы и временные профили теста очищены.
- **E1 — выполнена локальная Windows часть; этап ещё открыт.** Последний `npm run tauri:build -- --bundles nsis` собрал Windows NSIS размером 6.03 MiB (6 327 135 bytes). Packaged smoke запустил production executable с изолированным профилем, открыл WebView, прочитал старый профиль и восстановил искусственно повреждённые settings/playtime JSON с сохранением исходных байтов в backup. `npm run test:tauri:installed` установил NSIS в уникальную временную папку, выполнил этот smoke установленным executable, удалил пакет штатным uninstaller и после удаления проверил, что account/auth/settings/playtime и файл мира остались в отдельном APPDATA; затем прежний Electron launcher открыл тот же профиль до экрана входа, а account/auth и игровой мир сохранились побайтно. Этот smoke включён в Windows CI. Текущий Tauri frontend основной chunk — 497.15 kB, TOTP chunk загружается отдельно (6.03 kB). MSI, чистая система без WebView2 и реальный запуск на macOS не проверялись. В `.github/workflows/build.yml` добавлен отдельный Tauri macOS startup smoke: он запускает собранный `.app` с временным HOME и ждёт создания настроек; этот шаг ещё не исполнялся на macOS. В macOS CI также добавлен runtime regression test пути Electron `userData`; GitHub Actions его пока не запускал. Локальная сборка не подтверждает подпись.
- **E2 — основная интеграция выполнена.** Добавлены neutral DTO, typed bridge, event bus с подпиской до PLAY, `app:ready` handshake, commands и capabilities. Команда отмены ждёт завершения того же поколения запуска, чтобы UI не считал отмену законченной раньше Rust-процесса. Списки `AppManifest`, invoke handler и capability теперь совпадают по всем 40 командам. Контракт `NatuxAPI` теперь хранится в `src/types/native.ts`, и Electron `preload.ts` вместе с Tauri bridge реализуют его напрямую; отдельный AST contract test сверяет все вложенные публичные методы Electron preload с этим интерфейсом. Packaged smoke вызывает `launcher_get_status` и idle `launcher_cancel`. Если desktop-host отсутствует вне явного локального preview или тестов, native bridge завершается `NativeHostUnavailableError`; fake-данные preview не используются в production renderer. Updater-команды имеют Rust-реализацию и отдельные тесты в рамках E7.
- **E3 — account/settings/game-session реализованы частично.** Настройки и playtime используют прежний `natux-world-launcher` userData; повреждённые JSON сначала сохраняются в соседнюю копию `*.corrupt-<UUID>.bak`, после чего сервис восстанавливает безопасные defaults. Аккаунт покрывает register, e-mail verification, login/2FA, bootstrap, logout и game-session. HTTP transport использует системное хранилище секретов, таймаут 6 секунд, лимит ответа 2 MiB и не следует redirect; JWT остаётся внутри Rust. При недоступном credential store сессия живёт только в памяти. Ошибка сохранения явно сообщает renderer, что сессия временная; при ошибке очистки logout сохраняет текущую сессию и UI не сбрасывает авторизованное состояние. Изолированный Windows packaged smoke читает старые `settings.json`, `playtime.json` и `minecraft/auth.json`, проверяет прежний UUID `installId`, `account.json` и файл мира, затем подменяет settings/playtime повреждёнными тестовыми байтами и подтверждает точные backup-копии и defaults. Rust сохраняет неизвестные верхнеуровневые и вложенные поля settings до явного reset. Зашифрованный Electron `account.json` не импортируется: при обычном запуске Tauri его сохраняет, а при явном локальном/глобальном выходе удаляет перед успешным завершением выхода; ошибка удаления не сообщает успех и не вызывает server revoke. Это не даёт Electron rollback вернуть сессию после выхода. В rollback-версии Electron файл читается асинхронным safeStorage decrypt с ограниченным повтором при ротации ключа; запись сохранена в прежнем формате для совместимости со старыми установками. Account API проверен локальными mock-тестами, production endpoint не вызывался. Регрессионные тесты подтверждают, что неверный код step-up/enrollment 2FA и ответ 403 от `/game-session` не удаляют сохранённую сессию; authoritative `/me` 401/403 и `/game-session` 401 по-прежнему очищают её. Electron и Tauri bridges принимают optional-код текущего фактора при повторном TOTP setup. Для аккаунтов с активным TOTP ProfileMenu предлагает заменить приложение: перед выдачей нового QR требуется текущий TOTP или резервный код; UI-тесты покрывают отказ, повторную попытку и успешную замену. Route-тесты сайта также фиксируют отказ без текущего фактора, успешную выдачу нового pending QR и первичное включение без step-up. Для email-фактора эта UI-операция не предлагается, а hosted/target-OS acceptance и реальный вход остаются открытыми. Межпроцессная блокировка общего legacy userData реализована локально: `.profile.lock` запрещает одновременный доступ Electron/Tauri, `.game.lock` защищает runtime/game mutation, а Java premain подтверждает блокировку до состояния `running`. Windows packaged-тесты прошли; CI на macOS/Linux и чистых системах ещё ожидается.
- **E4 — код и fixture-тесты реализованы; настоящая Java и полная установка Minecraft resources подтверждены на Windows x64.** Rust покрывает загрузки, metadata, Java 21, архивы, assets/libraries/natives и Forge resources. JSON версии Minecraft теперь читается/сохраняется в том же `versions/<id>/<id>.json`, что и Electron; cache hit не требует сети, повреждённые, слишком большие и несовпадающие по `id` файлы удаляются, запись атомарна, symlink escape отклоняется кодом. Для symlink-защиты добавлен Unix-only regression test, который не запускался на текущей Windows-системе. Asset index проходит через существующую проверку SHA-1/size в download cache. Перед сетью проверяется, что на диске каталога Minecraft доступно не менее 1.5 GiB. Загрузки возобновляются через стабильный `.part` и HTTP Range только после проверки `Content-Range`; ответы 200/416 и неверный диапазон безопасно переходят к полной загрузке. Используется idle timeout в 60 секунд на получение заголовков и каждого следующего блока, а не общий лимит продолжительности; временные ответы 408/425/429/5xx повторяются до трёх попыток. Запросы metadata Mojang и Adoptium также повторяются при временных сбоях; отмена останавливает активный запрос или ожидание между попытками. Production Tauri executable в изолированном профиле установил Temurin `21.0.12.1`, после чего `java_detect` и `java -version` подтвердили runtime. Перенос Java cancellation в blocking worker и локальная отмена ZIP/TAR подтверждены 13 октября ниже; проверка целевых ОС/архитектур и cross-platform-отмена остаются открытыми. Live-установка Minecraft resources на Windows подтверждена ниже.
- **E5 — локальный launch pipeline реализован; live acceptance открыт.** Есть game-session, Forge install, classpath/argfile, process lifecycle, cancellation и playtime. До Mojang metadata и загрузок запрашивается одна проверенная game-session; отмена проверяется вокруг запроса, а имя синхронизируется в legacy-файл только после подготовки Forge. Вывод stdout/stderr Forge попадает в `launcher:log`; ошибка хранит ограниченный хвост stderr, а логи читаются из обоих потоков одновременно. При завершении приложения playtime-сессия закрывается, а после выхода Java чтение логов ограничено по времени. Дерево процессов привязано к Windows Job Object либо Unix process group; регрессионный тест прошёл на Windows, Unix-тест добавлен, но не запускался на текущем хосте. В crash report имя используется только для последующей redaction; настоящий game-session token остаётся в памяти для аргументов игры. Добавлен `tests/e2e/tauri-live.test.cjs`: Windows-only live harness запускает packaged Tauri в отдельном временном профиле, удаляет credentials из окружения Tauri/игрового процесса и принимает только новую запись точного test-username в отдельном server log после PLAY. До PLAY тест сравнивает production game-server host с test target и переопределяет только quick-play destination на адрес с loopback/private IP либо DNS-меткой `test`; production сервер запускаться не должен. Поскольку аккаунт лаунчера сохраняется в Windows Credential Manager вне `APPDATA`, preflight также требует отдельную Windows-учётную запись с `test` в имени и проверяет совпадение с текущей учётной записью; после теста выполняется локальный logout. Windows CI запускает preflight, но live часть пропускается без явного opt-in. Локальная staging-среда подготовлена в `C:\Users\Public\Documents\natux-tauri-test-server`: Paper 1.21.1 build 133, Temurin 21.0.12.1+1 и authlib-injector 1.2.7 скачаны с проверкой размеров и SHA-256/SHA-1. Сервер привязан к `127.0.0.1:25567`, использует `online-mode=true`, `enforce-secure-profile=true`, whitelist на одного игрока, отключённые RCON/query; `eula.txt` оставлен `false`, whitelist пуст, сервер не запускался. Нужны выделенный test account с Minecraft UUID, отдельная Windows-учётная запись, локальные секреты входа и самостоятельное принятие EULA. Live acceptance не запускался. Обычный аккаунт и игровые данные пользователя запрещены.
- **E6 — локальные renderer/native службы реализованы.** Подключены diagnostics, которые проверяют подписанный Tauri control, versioned `latest.json` и наличие доверенных URL/подписей пакетов, opt-in reporting/telemetry с redaction и нормализацией OS/architecture меток к legacy-контракту, Java picker и bounded probe, URL/screenshots, tray, autostart и live apply настроек. При macOS `RunEvent::Reopen` Tauri восстанавливает главное окно либо пересоздаёт его после закрытия; есть GUI-free policy tests, но проверка Dock на macOS ещё не выполнена. Визуальный smoke production executable на Windows показал экран входа в Tauri WebView при 1280×800; ошибок renderer console/pageerror не было. `tests/e2e/tauri-packaged.test.cjs` теперь также проходит login→registration→back, проверяет client-side validation кнопок и отсутствие renderer errors, не отправляя запросы аутентификации. Реальный вход/регистрация и межплатформенная визуальная/OS-приёмка не выполнены. Discord Rich Presence остаётся отключён пустым `discordClientId`, как и в текущей конфигурации.
- **E7 — реализован локальный контур; релизная приёмка открыта.** Подключён `tauri-plugin-updater`; Rust проверяет Ed25519 control, версию/channel/rollout и скачанный Tauri-артефакт, а установка остаётся явным действием UI. Генератор создаёт Tauri v2 `latest.json`, sidecar-подписи и checksums в отдельных GitHub Releases; старый electron-updater feed не меняется. Для канала Tauri пользователь выбрал отдельный `TAURI_SIGNING_PRIVATE_KEY` GitHub Actions secret; приватный ключ не хранится в репозитории. Windows использует автоматическую загрузку проверенного пакета с явным подтверждением установки. macOS использует ручное обновление: после проверки подписанных control/feed UI показывает точный versioned GitHub Release и не загружает пакет в фоне. Linux пока не является целевой платформой релиза: генератор и workflow не собирают Linux-пакет, поэтому native updater явно сообщает о неподдерживаемой платформе. Electron при включённом `migrationEnabled` предлагает соответствующий Windows/macOS GitHub installer; rollout/version/channel и same-version migration покрыты unit-тестами. В `.github/workflows/build.yml` добавлен opt-in `TAURI_MIGRATION_ENABLED` (выключен при пустой переменной), вместе с `TAURI_UPDATES_ENABLED` workflow создаёт versioned feed и отдельные `tauri-stable-feed`/`tauri-beta-feed` GitHub Releases. Планирующая job видит только boolean-признаки наличия приватных ключей updater/control-feed и платформенных сертификатов; платные сертификаты проверяются только при явном CODE_SIGNING_ENABLED=true, иначе Tauri builds unsigned/ad-hoc; Electron beta manifest получает выбранный канал; при включении Tauri updates процент rollout задаётся явно. Свежие Windows NSIS и macOS updater bundles проверяются против встроенного minisign public key до загрузки; contract tests проверяют эти workflow-условия. Новый control-feed verifier использует тот же встроенный Ed25519 public key, что и клиент, проверяет JSON/signature до загрузки или публикации Tauri Release и получает окружение без `UPDATE_SIGNING_PRIVATE_KEY`; неверная пара блокирует workflow. OS signing secrets необязательны: только при `CODE_SIGNING_ENABLED=true` workflow требует Windows `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` и macOS `CSC_LINK`, `CSC_KEY_PASSWORD`, `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Updater требует secret `TAURI_SIGNING_PRIVATE_KEY`; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` нужен только если updater key защищён паролем. Feed control использует существующий `UPDATE_SIGNING_PRIVATE_KEY`. Для Tauri updater release на `main` нужны Actions variables `TAURI_UPDATES_ENABLED=true` и явный `TAURI_ROLLOUT_PCT`; `CODE_SIGNING_ENABLED=true` необязателен и нужен только при наличии сертификатов. `TAURI_MIGRATION_ENABLED=true` включать только после завершения приёмки E0–E7. Пользователь сообщил, что сертификаты Windows/macOS слишком дороги, поэтому выбран unsigned/ad-hoc выпуск без их покупки; значения существующих updater/feed секретов в сообщения не запрашиваются и в репозиторий не добавляются. Read-only проверка GitHub CLI 13 октября показывает, что на уровне репозитория присутствуют только `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY`; `gh variable list` не возвращает Actions variables. Windows/macOS code-signing secrets (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) и opt-in variables пока не подтверждены. Workflow Build на `main` последний раз завершился успешно 9 сентября на старом commit `9fefa8c`; новый workflow с миграционными изменениями ещё не запускался. Локальный NSIS `.exe` пересобран позже соседнего `.sig`, и эта пара не проходит verifier; принимаемым результатом станет только новая CI-сборка с валидной подписью. Последний публичный release `v1.9.15` от 12 июля содержит Electron assets, но не Tauri `latest.json` или Tauri packages ([release](https://github.com/Alex-dev-sys/NatuxWorld/releases/tag/v1.9.15), [Build workflow](https://github.com/Alex-dev-sys/NatuxWorld/actions/workflows/build.yml)). Поэтому новая GitHub Actions сборка и Tauri Releases ещё не запущены; Ручное разрешение запуска на macOS, Electron→Tauri upgrade, Tauri→Tauri upgrade, downgrade/update rollback и staged rollout не приняты; локальный unsigned Electron rollback smoke на изолированном профиле прошёл.
- **Решение по стоимости сертификатов, 13 октября 2026:** пользователь отказался покупать сертификаты подписи Windows/macOS. Это больше не блокирует Tauri updater-релиз: Tauri package/update signatures и подпись control-feed остаются обязательными, а OS code signing/notarization переключаются только при наличии отдельных сертификатов и явном `CODE_SIGNING_ENABLED=true`. Без сертификатов workflow собирает Windows без Authenticode и macOS с ad-hoc подписью; проверки updater-подписей и контрольных метаданных остаются обязательными. SmartScreen и Gatekeeper потребуют ручного подтверждения первого запуска; это следует проверить и объяснить в релизных инструкциях. Остаются внешними блокерами live Minecraft acceptance, фактическая GitHub Actions сборка/публикация и upgrade/rollback acceptance.
- **E8 — не начат.** Electron остаётся стандартной сборкой и откатным путём; зависимости, scripts и release workflow не удалялись и не переключались.
- **E9 — снят повторный spot-check на Windows; оптимизация после cutover не начата.** Трёх запусков недостаточно, чтобы заменить 20-запусковой baseline E0 или делать вывод об общей производительности; безопасный cutover ещё не пройден.

### Повторная приёмка этапов 2–5, 13 октября 2026

- **Этап 2 — локальная Windows-приёмка пройдена частично.** Свеже собранный NSIS installer имеет размер 6 342 550 bytes (6.05 MiB). Установка, packaged smoke, штатное удаление и запуск Electron на том же изолированном профиле прошли; account/auth/settings/playtime и маркер игрового мира сохранились. Конфигурация Windows явно задаёт тихую установку WebView2 через `downloadBootstrapper`; Tauri указывает, что при отсутствии runtime этот способ требует интернета. На текущем ПК WebView2 уже установлен, поэтому сценарий без runtime не воспроизведён; macOS bundle и Dock smoke не запускались.
- **Этап 3 — локальные release-контракты прошли, релизная приёмка не выполнена.** Прошли 10 workflow contract tests, 5 тестов генератора Tauri feed и 3 parity/config contract tests. Реальная Windows/macOS Actions-сборка, updater с production secrets, обновление/прерывание/откат и GitHub Release не проверялись и не публиковались.
- **Этап 4 — переключение по умолчанию отложено.** Electron остаётся стандартной сборкой и проверенным откатом, потому что live Minecraft acceptance, macOS-приёмка и настоящий updater-релиз ещё не закрыты. Удаление Electron до этих проверок убрало бы подтверждённый путь возврата.
- **Этап 5 — повторный baseline без оптимизационных изменений.** По три изолированных запуска дали медиану готовности UI 1 132.6 ms для Electron и 562.4 ms для Tauri; Working Set через 5 секунд — 355.5 MiB и 373.9 MiB соответственно; медиана чтения settings — 0.35 ms и 1.20 ms. Installer на этом запуске: Electron 107 335 486 bytes, Tauri 6 342 550 bytes. Это короткий spot-check на одной Windows x64 машине, а не основание для заявлений о производительности; перед оптимизацией нужны безопасный cutover и повторяемое профилирование.

Проверки локального состояния на Windows (12 октября 2026): корневые `npm run lint`, `npm run typecheck`, `npm test -- --reporter=dot` (153 теста), `npm run build:web`, `npm run test:release:workflow` (6 тестов), `node --test tests/scripts/native-api-parity.test.mjs` (1 test), `node --test tests/scripts/generate-tauri-feed.test.mjs tests/scripts/tauri-command-contract.test.mjs tests/scripts/native-api-parity.test.mjs` (7 тестов) и YAML parsing и `git diff --check` прошли. В этой сессии также прошли Rust `cargo fmt --manifest-path src/native/Cargo.toml -- --check`, `cargo test --manifest-path src/native/Cargo.toml --locked` (168 library tests + 1 verifier test) и `cargo clippy --manifest-path src/native/Cargo.toml --all-targets --locked -- -D warnings`. Windows regression test подтвердил завершение потомка через Job Object после выхода корневого процесса; Unix counterpart добавлен, но не запускался. После последних изменений повторно выполнены `npm run tauri:build -- --bundles nsis`, `npm run test:tauri:packaged` и `npm run test:tauri:installed`; все прошли, включая запуск прежнего Electron launcher на том же изолированном профиле после удаления Tauri и побайтовую проверку account/auth/мира. После унификации `NatuxAPI` Electron `npm run build` и `npm run test:packaged` прошли повторно; `npm run test:tauri:installed` заново подтвердил установленный Tauri smoke, чистое удаление и rollback запуском Electron на том же изолированном профиле с побайтовой сохранностью account/auth/мира. После fail-closed изменения повторно прошли полный suite (153 теста), lint/typecheck, Electron NSIS+portable build и packaged smoke, Tauri NSIS build, packaged и installed rollback smoke; production bundles Electron и Tauri не содержат уникальные маркеры preview аккаунта, сервера и Java. `npm run test:tauri:live` не запускался: staging Paper 1.21.1/Java 21 готов, но `eula=false`, marker/whitelist пока пусты; необходимы выделенный аккаунт без 2FA, отдельная Windows-учётная запись и локальные секреты тестового входа. Workflow содержит Windows/macOS signature verification, но новый GitHub Actions запуск не выполнялся. Сайт после `npm ci`: `npm run lint`, `npm run typecheck`, `npm test` (204 теста) и `npm run build` прошли; lint/build оставляют предупреждение `src/app/layout.tsx:39` о Google Fonts. Установка npm-сайта сообщила о 36 dependency advisories (11 moderate, 22 high, 3 critical); `npm audit --omit=dev` подтвердил 17 для production dependency tree (6 moderate, 10 high, 1 critical). Они не исправлялись в рамках миграции; часть автоматических рекомендаций требует major updates. macOS build/notarization, установка подписанного пакета на чистой системе, реальные GitHub Releases, Electron→Tauri/Tauri→Tauri upgrades, подписанный downgrade/update rollback и staged rollout не проверялись; локальный unsigned Electron rollback smoke на изолированном профиле прошёл. Windows не разрешил создать symlink для теста screenshots (ошибка ОС 1314), поэтому этот системный сценарий на данном хосте не проверен; Unix-вариант теста добавлен, но здесь не запускался.

Начать updater/installer совместимость и выбор packaged E2E в E1, не откладывая проверку риска до последнего этапа. Полную реализацию завершать в E7.

При параллельной реализации назначать владельцев модулей: native downloads/resources; native account/storage/migration; renderer/bridge; release/E2E. Один владелец каждого файла; ведущий интегрирует. Контракты утверждать до независимых изменений. Не откатывать пользовательские или соседние правки.

Сроки определить после E1/E2 и проверки migration/update spikes. Не обещать фиксированную дату или коэффициент ускорения до проверки сложности реального проекта.

## 11. Проверки и матрица приёмки

### Быстрые и интеграционные проверки

Сохранить полезные сценарии `src/__tests__/App.launch-flow.test.tsx` и валидаторов. Service tests переносить по поведению и fixtures, а не механически копировать проверки внутренней реализации.

| Область | Обязательные сценарии |
|---|---|
| Bridge/DTO | Полный контракт; неверный ввод; отказ непривилегированного окна; subscribe-before-play; cleanup до завершения subscribe; StrictMode; snapshot/reload |
| Downloads | 200/206, корректный/неверный Range, retries, timeout, abort, hash/size mismatch, duplicate destinations и конкурентные batches |
| Metadata/archives | OS/feature rules, inheritance/Forge merge, conflicting asset size, malformed JSON/ZIP, traversal/symlink, разные natives x64/arm64 |
| Java/Forge | Отсутствующая/сломанная Java; правильный архив; повреждённый runtime; installer cancel; отсутствующий patched JAR; retry/cache reuse |
| Game process | Длинный classpath; пробелы/кириллица; безопасный argfile; redaction; stdout/stderr; normal/crash exit; cancel; двойной PLAY; корректное дерево процессов |
| Account/2FA | Register/verify/resend, bad credentials/code, rate limit, TOTP/e-mail/backup challenge, enrollment/relogin, local/global logout, offline против 401/403 |
| Migration | Новый/старый/частично импортированный профиль; конфликт; повреждённый файл; недостаточное место; повторный запуск; rollback; session re-login |
| UX/platform | Resources/CSP, окно/DPI/focus, clipboard/opener, hidden startup, tray failure, autostart, closeOnLaunch и восстановление running |
| Reporting/playtime | По умолчанию нет отправки; opt-in/redaction/caps; backend offline; heartbeat/end race; recovery после сбоя; Discord отсутствует |
| Update/release | Platform/arch/channel/version, подпись/ключ, artifact tampering, upgrade/restart, data preservation, Electron transition, WebView2 на чистой ОС |

Текущий Electron harness использует CDP, preload и `app://launcher`; он не проверяет Tauri. Для Windows добавлен изолированный packaged smoke в `tests/e2e/tauri-packaged.test.cjs`, который запускает production executable с временным профилем, проверяет WebView, настройки, playtime и сохранность старых данных. Дополнительный `tests/e2e/tauri-installed.test.cjs` устанавливает NSIS в временную папку, запускает тот же smoke по установленному executable, вызывает штатный uninstaller и проверяет, что изолированный legacy-профиль остался в APPDATA; это проверяет установку на текущем Windows-хосте с установленным WebView2, а не чистую систему. Вложенный test runner очищает `NODE_TEST_CONTEXT`, чтобы Node не пропустил smoke как рекурсивный запуск. Workflow запускает Tauri NSIS-сборку и packaged smoke на обычных CI-запусках, а при updater-релизе использует подписанную updater-сборку. На macOS workflow теперь запускает startup smoke собранного Tauri `.app` с временным HOME и проверкой native settings storage; его первый прогон ещё ожидает macOS CI. В macOS job также добавлен runtime regression test legacy Electron `userData`; GitHub Actions пока его не запускал. Полноценный native UI smoke и установка подписанных пакетов на целевой ОС не проверены. Ни один из этих harness не подтверждает live-подключение к игре. Для расширения native E2E проверить `@wdio/tauri-service`: текущая документация описывает embedded WebDriver для Windows/Linux/macOS. Прямой `tauri-driver` имеет другие платформенные ограничения. Тестовые plugins включать только в отдельный test build. Browser-mode с mock IPC проверяет frontend, а не реальные Rust службы. [Tauri WebDriver][webdriver].

Инструментированная E2E-сборка не заменяет приёмку итогового production executable: отдельно установить и запустить production-пакет без test plugins, проверить UI/native smoke и live-сценарий подходящим внешним harness либо документированной ручной процедурой. Отсутствие E2E automation на конкретной ОС не даёт права объявлять её проверенной.

Локальный Windows прогон 2026-10-12: `npm run lint`, `npm run typecheck`, `npm test` (151 тест), `npm run build:web`, `cargo fmt --manifest-path src/native/Cargo.toml -- --check`, `cargo test --manifest-path src/native/Cargo.toml --locked` (168 библиотечных + 1 updater verifier test), `cargo clippy --manifest-path src/native/Cargo.toml --all-targets --locked -- -D warnings` и `npm run test:release:workflow` (6 проверок) прошли. `npm run tauri:build -- --bundles nsis` собрал NSIS размером 6 299 406 bytes; `npm run test:tauri:packaged` и `npm run test:tauri:installed` прошли с временным профилем. Это подтверждает текущий Windows host. macOS CI теперь также запускает Rust formatting, unit tests и Clippy, чтобы проверить Unix process-group ветку; первый такой CI прогон и macOS packaged acceptance ещё ожидаются. Подписанные релизы и live-подключение к серверу остаются отдельными gates.

После hardening updater/downloads 12 октября 2026 прошли `cargo fmt --manifest-path src/native/Cargo.toml -- --check`, `cargo test --manifest-path src/native/Cargo.toml --locked` (172 native tests + 1 updater signature verifier test), `cargo clippy --manifest-path src/native/Cargo.toml --all-targets --locked -- -D warnings`, `npm test -- --reporter=dot` (154 теста), `npm run lint`, `npm run typecheck`, `npm run build:web`, `npm run tauri:build -- --bundles nsis` (6.01 MiB), `npm run test:tauri:packaged` и `npm run test:tauri:installed`. `node --test tests/e2e/tauri-live.test.cjs` прошёл четыре безопасных preflight-проверки и пропустил live-сценарий без opt-in. Обновления ограничивают control response до чтения тела, отправляют ошибки фоновой проверки через `updater:event`, а download errors сохраняют безопасную сетевую категорию. Проверка свежего локального NSIS повторно подтвердила, что соседний `.sig` остался от предыдущей сборки: встроенный verifier отклонил пару, поэтому артефакт не является проверенной подписанной поставкой. Пользователь подтвердил Windows и macOS как платформы подписи. Текущая read-only проверка GitHub показала только `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY`; Windows/macOS code-signing secrets и Actions variables отсутствуют, значения секретов не читались. Последний Build workflow в GitHub завершился 9 сентября на базовом commit `9fefa8c`; последний публичный release — Electron `v1.9.15` от 12 июля. Live E5 остаётся открытым: выделенного аккаунта без 2FA нет, подготовленный Paper staging остаётся остановленным с `eula=false` и пустым whitelist; EULA следует принять вручную после подготовки тестового аккаунта. UI указывает, что настройка auto-update применяется со следующего запуска, поэтому существующее поведение фонового цикла соответствует текущей подсказке.

Следующая Windows-приёмка 12 октября нашла несовпадение схемы актуального ответа Adoptium: `project=jdk` находится в `binaries[].project`, а parser проверял только верхний уровень. Проверка перенесена на конкретный binary с поддержкой прежнего расположения поля; Rust regression fixture теперь повторяет актуальную схему и отвергает другой project. После исправления прошли `cargo fmt --manifest-path src/native/Cargo.toml -- --check`, все 172 Rust unit tests + 1 verifier test, Clippy, `npm run tauri:build -- --bundles nsis` (6.01 MiB), `npm run test:tauri:packaged` и `npm run test:tauri:installed`. Реальная команда `java_install` в production Tauri executable загрузила Temurin `21.0.12.1` во временный APPDATA, проверила размер/SHA-256 и архив, затем `java_detect` вернул установленный runtime и `java.exe -version` подтвердил версию. Временный профиль удалён. Это закрывает локальную Windows-проверку установки Java, но не чистую Windows/macOS систему и не live Minecraft E5; доступ к аккаунту/серверу и принятие EULA всё ещё не подготовлены.

В том же прогоне `npm run build` и `npm run test:packaged` проверили текущий unsigned Electron rollback launcher; `node --test tests/e2e/electron-safe-storage-interop.test.cjs` проверил, что Electron runtime строит `userData` из packaged app identity, и подтвердил Windows safeStorage round-trip. В `website/` прошли `npm run lint` (с имеющимся warning о custom font), `npm run typecheck` и `npm test` (204 теста в 49 файлах). Сборка `release/win-unpacked/resources/app.asar` содержит package `name=natux-world-launcher` и не содержит `productName`; на текущем Windows host найден legacy-каталог с этим именем, а каталог `NATUX WORLD` отсутствует. Новый Rust test `legacy_user_data_directory_matches_the_packaged_electron_name` привязывает Tauri resolver к `productName`/`name` из root package.json. Это не заменяет подписанный Electron→Tauri install/rollback test.


**Приёмка ресурсов 13 октября 2026:** первая попытка полной загрузки выявила, что актуальный официальный manifest содержит исторические ID с пробелами (`1.14.2 Pre-Release 4`, `3D Shareware v1.34`), а прежняя проверка отвергала весь manifest. Проверка ID теперь разрешает внутренние ASCII-пробелы, но по-прежнему запрещает traversal, ведущие/завершающие пробелы, завершающую точку и зарезервированные имена Windows. Добавлены проверки разбора официальных ID и их использования в cache/JAR paths. `cargo fmt --all`, `cargo test --locked` (174 библиотечных теста + 1 verifier; 1 opt-in тест пропущен обычным suite) и `cargo clippy --locked --all-targets -- -D warnings` прошли. Отдельный opt-in тест `live_minecraft_resources_install_complete_for_current_platform` повторно прошёл за 36.27 секунды: production Rust-код получил Mojang metadata, скачал и проверил клиентский JAR, библиотеки и более 4 000 assets, затем извлёк natives текущей Windows-платформы; временный профиль изолирован через `TempDir`. Java cancellation и другие ОС/архитектуры остаются открытыми.
**Проверка packaged/release preflight 13 октября 2026:** после изменения metadata Rust пересобран Windows NSIS (`npm run tauri:build -- --bundles nsis`, 6,299,591 bytes); `npm run test:tauri:packaged` (1) и `npm run test:tauri:installed` (2) прошли. `npm run test:release:workflow` прошёл 6 проверок. `node --test tests/e2e/tauri-live.test.cjs` прошёл 4 безопасные preflight-проверки и пропустил live login без opt-in, как предусмотрено. GitHub Actions secret names проверены без чтения значений: настроены только `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY`; variables отсутствуют. Для выбранных Windows/macOS code signing workflow требует `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; эти секреты отсутствуют. Локальный NSIS нельзя публиковать: его `.exe` пересобран после соседнего `.sig` (12 октября 15:34 UTC против 11 октября 14:41 UTC), поэтому подпись не подтверждает текущий бинарник. Нужны пользовательские сертификаты и GitHub Actions secrets; приватные ключи не читались и не запрашиваются в сообщениях.
**Проверка renderer и website 13 октября 2026:** в корне прошли `npm run lint`, `npm run typecheck`, `npm test -- --reporter=dot` (154 tests) и `npm run build:web`; сборка сохранила Electron rollback bundles и Tauri renderer. В `website/` прошли `npm run lint`, `npm run typecheck`, `npm test` (204 tests) и `npm run build`. Осталось только существующее предупреждение Next.js о Google Font в `src/app/layout.tsx:39` и сообщение Vitest/Vite о deprecated CJS API.

**Отмена установки Java, 13 октября 2026:** shared cancellation token теперь доходит до blocking worker; ZIP/TAR.GZ распаковка копирует файлы порциями и проверяет отмену также во время TAR preflight. Регрессионный тест отменяет каждый формат после первого записанного блока и подтверждает очистку staging-папки и сохранность прежнего `jre-21`. Прошли `cargo fmt --all -- --check`, `cargo test --locked` (175 passed, 1 ignored; updater verifier 1 passed), `cargo clippy --locked --all-targets -- -D warnings`, `npm run tauri:build` (Windows MSI 8.77 MiB, NSIS 6.01 MiB), `npm run test:tauri:packaged` и `npm run test:tauri:installed`. Это закрывает локальный Windows cancellation path; macOS/Linux и чистые target systems остаются открытыми. Live acceptance не запускался: нет выделенного test account/Windows account, серверный staging всё ещё ждёт ручного принятия EULA.

**Точка остановки, 13 октября 2026:** Java detection тоже переведён на cancellable blocking worker; добавлен тест, проверяющий распространение отмены из `java_detect`. На текущем исходнике прошли `cargo fmt --all -- --check`, `cargo test --locked` (176 passed, 1 ignored; updater verifier 1 passed) и `cargo clippy --locked --all-targets -- -D warnings`. После остановки повторно прошли `npm run tauri:build` (Windows MSI 8.77 MiB, NSIS 6.01 MiB), `npm run test:tauri:packaged` (1 passed) и `npm run test:tauri:installed` (2 passed); оба smoke используют изолированный временный профиль и проверяют сохранность legacy profile после удаления Tauri. Electron rollback заново собран `npm run build`; `npm run test:packaged` подтвердил login→registration→login (1 passed). `npm run test:release:workflow` (6), API parity (1) и feed generator (5) проходят. Попытка `cargo check --locked --target aarch64-apple-darwin` на Windows остановилась в `objc2-exception-helper`: для Objective-C build script отсутствует C compiler; она не подтверждает и не опровергает macOS-корректность, нужен macOS runner. GitHub Actions read-only проверка показывает последний run 9 сентября на прежнем commit `9fefa8c`; изменения миграции не публиковались. Следующие незакрытые gates — macOS/чистые системы, live E5 и release/signing. Live E5 ждёт отдельный тестовый Natux/Minecraft account без 2FA, отдельную Windows account и ручное принятие EULA для уже подготовленного выключенного Paper staging. В рабочем дереве также есть изменения Electron/website и удаление временного DOCX; они не были очищены или закоммичены, их нужно сохранить при продолжении. Публикация не выполнялась.

**Продолжение реализации, 13 октября 2026:** устранён возврат старой Electron-сессии после Tauri logout: обычный запуск Tauri сохраняет legacy `account.json`, явный local/global logout удаляет его, а ошибка удаления блокирует успешный выход; добавлены проверки успешного выхода и отказа при неудаляемом пути. E4: отмена native-распаковки теперь проверяется после каждого блока 64 KiB и сохраняет прежний `natives` при отмене; E5: повреждённые Forge JSON/JAR очищаются перед повторной установкой, при этом permission/I/O ошибки и небезопасные пути не маскируются. E7: release workflow проверяет control JSON и подпись общим с Rust-клиентом Ed25519 ключом до публикации и запускает verifier без `UPDATE_SIGNING_PRIVATE_KEY` в окружении. Проверки прошли: `cargo fmt --all -- --check`; `cargo test --locked` (183 passed, 1 ignored; отдельный updater verifier 1 passed); `cargo clippy --locked --all-targets -- -D warnings`; helper verifier test (1); `npm run test:release:workflow` (7), API parity (1), feed generator (5), Tauri build (MSI 8.78 MiB, NSIS 6.02 MiB), packaged smoke (1), installed/uninstall smoke (2), повторная полная загрузка и проверка Minecraft 1.21.6 ресурсов (36.09 s). Истинный live login/join не запускался. На момент этой записи межпроцессная блокировка Electron/Tauri для общего legacy userData ещё не была реализована; это закрыто следующей записью ниже.

**Межпроцессные блокировки, 13 октября 2026:** общий Rust lock-core интегрирован в Tauri; Electron использует упакованный `lock-helper`, а оба лаунчера передают `.game.lock` Java premain-agent и ждут точный READY marker до признания игры запущенной. Защищены lifetime профиля, runtime/game mutations, offline-auth file, Java install и screenshots directory; параллельная mutation lease в одном процессе также отклоняется.

Проверки Electron: `npm run build`, `npm run test:packaged` (1), `npm run typecheck`, `npm test` (160), targeted ESLint и Java-agent harness (23 assertions; Windows symlink-case skipped) and Rust child-process test confirming Java-agent environment variables are removed. Проверки Tauri: `npm run tauri:build -- --bundles nsis` (6.03 MiB), `npm run test:tauri:packaged` (1), `npm run test:tauri:installed` (2); Rust `cargo fmt --check`, `cargo test --locked` (188 passed, 1 ignored; verifier 1 passed), `cargo clippy --all-targets --locked -- -D warnings`. Release-workflow tests (7) и lock-runtime package contract tests (2) тоже прошли. macOS/Linux CI ещё не запускался. `node --test tests/e2e/tauri-live.test.cjs` passed 4 preflight checks and skipped actual live run; current staging check reports `eula=false`, empty whitelist, closed test port, and absent live-test environment. Эта интеграция не закрывает live login/join, подпись/публикацию релиза или upgrade acceptance.

**Проверка текущего дерева, 13 октября 2026:** Tauri больше не завершает активную Java/Minecraft сессию при закрытии окна или выборе tray «Выход»: окно скрывается, а app exit откладывается до завершения launch pipeline; повторное открытие через single-instance/tray снимает отложенный выход. Добавлены тесты перехода состояния. Свежие результаты: Rust `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` (194 passed, 2 ignored; updater verifier 1 passed); root lint/typecheck и Vitest (161); release workflow (10) и bridge/feed/lock contracts (9). `npm run build` и `npm run test:packaged` прошли для Electron rollback; `npm run tauri:build -- --bundles nsis` собрал unsigned NSIS 6.05 MiB; Tauri packaged (1) и installed/uninstall (2) smoke прошли на временном профиле, включая запуск Electron с тем же профилем после удаления Tauri. После исправления credential namespace smoke использовал случайный installId; Windows Credential Manager round-trip отдельно прошёл opt-in тестом с временным ключом. safeStorage interop (2) подтвердил Windows legacy round-trip, но Tauri не импортирует Electron JWT: новый вход остаётся отдельным E3 acceptance. Tauri live preflight прошёл 4 проверки и пропустил настоящий login/join; сервер всё ещё `eula=false`, whitelist пуст, порт закрыт. Секреты/переменные и последний GitHub Actions run сверены read-only; подписанный артефакт не создавался, ничего не публиковалось. macOS packaged smoke расширен синтетическим legacy userData (settings/playtime/account/auth/world), ожиданием `.profile.lock` и проверкой сохранности файлов после остановки процесса; локальный Windows запуск подтвердил корректный skip, runtime-проверка ожидает macOS CI. Release workflow теперь до staging проверяет Windows Authenticode подписи app/NSIS и точный thumbprint сертификата, а для macOS — codesign identity, Gatekeeper assessment и stapled notarization ticket; contract suite 10/10, YAML/PowerShell/Bash scripts syntax-checked. Реальные подписанные сборки ждут CI secrets.

### Live acceptance игры

- Использовать отдельный подтверждённый тестовый аккаунт и новый временный игровой профиль, без обычного аккаунта или игровых данных пользователя.
- Подготовить NatuxWorld test account с отдельным Minecraft username, разрешённым для входа на staging server. Текущая автоматизация проходит базовый password-login без 2FA; не отключать 2FA у существующего аккаунта — создать отдельную тестовую учётную запись. Логин и пароль вводить только в локальные секреты/окружение тестового запуска.
- Подготовить отдельный Minecraft staging instance: отдельная папка и мир, отдельный адрес с `test` hostname или private/loopback IP, совместимая конфигурация Natux Yggdrasil/Authlib, whitelist для test username и отдельный серверный лог. Не использовать production адрес, папку мира или лог.
- Файлы локального staging instance уже подготовлены скриптом `scripts/prepare-tauri-live-server.ps1` в `C:\Users\Public\Documents\natux-tauri-test-server`. Он устанавливает Paper 1.21.1 stable build, Temurin Java 21 и authlib-injector; включает loopback bind, custom Yggdrasil auth, secure profile и однослотовый whitelist. Сервер остаётся остановленным, `eula.txt` содержит `eula=false`, whitelist пуст. После создания выделенного аккаунта повторить скрипт с `-TestUsername <name> -TestUuid <uuid>`, прочитать EULA и принять её вручную, затем запускать `start-test-server.ps1` из отдельного Windows test account. Стартовый скрипт проверяет EULA и ровно одну запись whitelist.
- Подготовить отдельную стандартную Windows account с `test` в имени и запускать live acceptance только из неё: системный Credential Manager хранит токен вне временного `APPDATA`, а тест выполняет локальный logout в конце.
- Для Tauri live теста запускать только отдельную команду `npm run test:tauri:live` из выделенной Windows-учётной записи, предварительно задав `NATUX_TAURI_LIVE_ACCEPTANCE=1`, `NATUX_TAURI_E2E_WINDOWS_ACCOUNT`, `NATUX_TAURI_E2E_SERVER_ROOT`, `NATUX_TAURI_E2E_SERVER_ADDRESS`, `NATUX_TAURI_E2E_DEDICATED_ACCOUNT=YES`, `NATUX_TAURI_E2E_ISOLATED_SERVER=YES`, `NATUX_E2E_LOGIN`, `NATUX_E2E_PASSWORD`, `NATUX_E2E_USERNAME` и `NATUX_E2E_SERVER_LOG`. Имя корневого каталога тестового сервера должно содержать `test`, а итоговый путь к логу должен оставаться внутри него. `NATUX_TAURI_E2E_WINDOWS_ACCOUNT` должен совпадать с текущим именем Windows-учётной записи. Не передавать значения пароля или сертификатов в сообщения/логи; секретные login/password не наследуются Tauri и Minecraft процессами.
- Tauri live automation сейчас покрывает Windows/WebView2. Для macOS провести аналогичную live acceptance вручную на отдельном устройстве/профиле до объявления E5 завершённым.
- Пройти настоящий вход, onboarding, установку Java/Minecraft/Forge, PLAY и подключение к выделенному серверу.
- Подтверждение — новая запись о входе точного тестового ника в серверном логе после начала PLAY. Старый log marker, `running`, HTTP 200 и запуск JVM недостаточны.
- Сохранить начальный offset лога; обнаруживать ротацию/усечение и не принимать старую запись за новый вход.
- Проверить выход/сбой игры, повторный запуск, отсутствие утечек токенов, очистку созданных процессов и только тестового профиля.
- Базовый текущий live test требует аккаунт без 2FA. Настоящий сценарий 2FA проверять отдельно на выделенном аккаунте; mock integration не объявлять live-проверкой.

### Команды проверки

Ниже команды текущей смешанной стадии. Они проверяют renderer и нативный прототип, но не подтверждают feature parity или live acceptance игры. Каждая команда выполняется отдельным шагом с проверкой результата.

Из корня репозитория:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build:tauri:web
cargo fmt --manifest-path src/native/Cargo.toml --check
cargo clippy --manifest-path src/native/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src/native/Cargo.toml --locked
npm run tauri:build
npm run test:tauri:packaged
npm run test:tauri:installed
npm run build
npm run test:packaged
```

Отдельный opt-in acceptance, только при готовой тестовой инфраструктуре:

```powershell
npm run test:packaged:live
npm run test:tauri:live
```

`npm run test:packaged:live` — live acceptance прежнего Electron rollback-пути; `npm run test:tauri:live` — новый Windows-only opt-in acceptance Tauri и без `NATUX_TAURI_LIVE_ACCEPTANCE=1` пропускается. `npm run build` и `npm run test:packaged` относятся к Electron-пути и нужны для сохранения проверенного rollback. `npm run test:tauri:packaged` запускает Tauri executable smoke; на Windows после NSIS-сборки `npm run test:tauri:installed` отдельно проверяет установку и удаление в временном каталоге. Ни один тест не доказывает работу на чистой системе без WebView2; macOS/Linux acceptance и установка подписанных пакетов остаются открытыми. Если менялись сайт/API/выдача загрузок, выполнить в `website/` отдельно `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` с настроенным test/build окружением и Prisma client. Для изменений плагина — `mvn --batch-mode --no-transfer-progress verify` в `website/natux-plugin/`. Не запускать миграции или mutating тесты против production БД как часть local verification.

## 12. Измерение результата, выпуск и откат

### Измерения

Сравнивать Electron и production Tauri на одинаковых машинах/ОС, с одинаковым интерфейсом, настройками и сценарием. Фиксировать версию WebView и сборки; Java/Minecraft учитывать отдельно от дерева процессов лаунчера.

| Показатель | Метод |
|---|---|
| Размер поставки | Installer/portable и installed footprint; отдельно сетевой объём WebView2 и первого игрового install |
| Память | Всё дерево процессов лаунчера вместе с WebView после одинакового времени простоя; отдельно нагрузка логов/установки |
| Запуск | Время от запуска executable до доступного login/main экрана; холодный и прогретый сценарий отдельно |
| Отзывчивость | UI при скачивании/распаковке, большом выводе Java, отмене и повторе |
| Установка игры | Одинаковые fixtures/server/network/cache; время и объём загрузки без влияния случайной сети |
| Надёжность | Ошибки, cancel/retry, orphan processes, сохранность профиля, успешный upgrade/rollback |

Для сравнения startup выполнить серию не менее 20 повторов и записать распределение/медиану, а не один лучший запуск. Числовые целевые пороги установить в E0/E1 на основании baseline и назначения устройства. В E8 публиковать измеренные значения; универсальное обещание «в N раз быстрее/меньше» не использовать.

### Порядок выпуска

1. Выпустить внутренние артефакты для чистых test profiles; закрыть все P0 этапы и матрицу платформ.
2. Проверить установку и обновление из прежнего Electron, затем Tauri→Tauri с фактическим уровнем подписи ОС (unsigned/ad-hoc по текущему решению); сохранить проверенный способ возврата.
3. Провести ограниченный opt-in pilot с резервной копией профиля; расширять аудиторию после анализа воспроизводимых ошибок.
4. Создать полный комплект артефактов, signatures/checksums/feed и проверить их доступность/согласованность до публикации.
5. Обновить выдачу desktop downloads на сайте, не нарушая переход старых клиентов. Изменение desktop-сборки не требует переноса платежей или БД.
6. Переключить основной канал после успешной приёмки; сохранить прежние артефакты и поддержку перехода.
7. Обновить существующие `docs/BUYER_HANDOVER.md`, README и команды CI; дополнительные документы создавать только при необходимости.

Текущая работа реализует локальный Tauri-вариант и подготовленный, но выключенный по умолчанию release workflow. GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY` настроены; их значения не хранятся в репозитории. Для Tauri updater не требуются сертификаты подписи ОС. Release workflow ещё не запускался и ничего не публиковал, поскольку opt-in repository variables отсутствуют. Production update channel, live acceptance, миграция пользовательских профилей и upgrade acceptance остаются открытыми; до этого Electron остаётся доступным для отката.

### Откат

- До cutover Electron продолжает собираться отдельным проверяемым способом; не удалять его реализацию раньше закрытия функций и данных.
- Electron и Tauri используют общий `.profile.lock` для `userData`; `.game.lock` защищает изменение Minecraft/runtime и передаётся Java-agent до старта игры. При отказе lock-helper или отсутствии READY-подтверждения игра не считается запущенной. Windows Electron/Tauri packaged-пути проверены; macOS/Linux runtime CI остаётся открытым.
- После cutover исходники доступны в Git, а старые проверенные installers и encrypted backup профиля сохраняются для возврата.
- При неудаче остановить новые rollout назначения и не обходить обязательные подписи updater-артефактов/control-feed. Отсутствие подписи ОС допускается по выбранной модели выпуска; у уже обновившихся пользователей использовать проверенную процедуру переустановки/восстановления.
- Новая схема настроек имеет version/backup и обратную совместимость либо отдельный преобразователь. Старый launcher не должен молча интерпретировать несовместимые данные.
- Не откатывать сохранённые миры и файлы игрока к старой копии без явного выбора: это уничтожит изменения после перехода. Отделять служебное состояние приложения от текущих игровых данных.
- Подмена feed на меньший номер версии не является доказанным rollback: downgrade проверяется как отдельный сценарий с действующими подписями и installer policy.

## 13. Когда переписывание считается завершённым

- [ ] Все существующие NatuxAPI методы и пользовательские сценарии закрыты таблицей паритета либо явно обозначенной границей текущего продукта.
- [ ] Установка Java/Minecraft/Forge, вход, игровой запуск, cancel/retry/exit и реальный server join проверены на заявленных ОС/архитектурах.
- [ ] React/UI сохранены; в renderer отсутствуют зависимости типов и runtime от `electron/`; production не использует фиктивный bridge.
- [ ] Секреты, миграция settings/playtime/installId/consents и пользовательские игровые файлы проходят соответствующую приёмку.
- [ ] Commands, capabilities, CSP, пути, URL, архивы и аргументы процессов имеют реальные негативные тесты на границах.
- [ ] Production-пакет не содержит Electron, electron-updater, preload/main bundle или Node.js sidecar прежней реализации.
- [ ] Tauri update/control signatures, Electron→Tauri, Tauri→Tauri и возврат проверены при выбранном режиме подписи ОС; старые каналы не сломаны.
- [ ] CI собирает и проверяет заявленные платформы; production не содержит WebDriver/test plugins и test overrides.
- [ ] Сайт и Paper остаются совместимыми; локальная готовность, pilot и production readiness отмечены отдельно.
- [ ] Метрики результата измерены; существенная регрессия устранена или явно принята как продуктовый компромисс.
- [ ] Существующие инструкции сборки/передачи обновлены и подтверждены выполнением команд.

## 14. Источники

Интернет-источники проверены при подготовке 12.10.2026. Использованы официальные документации проектов, документации авторов библиотек и upstream-репозитории. Версии, системные требования и API следует сверить повторно перед реализацией и зафиксировать в lockfiles.

### Интернет

1. [Tauri: назначение, архитектура frontend/backend и размер приложения][tauri].
2. [Tauri: интеграция Vite][vite].
3. [Tauri CLI 2.0.4: нестандартная структура и TAURI_APP_PATH/TAURI_FRONTEND_PATH][custom-paths].
4. [Tauri: вызовы Rust из frontend][commands].
5. [Tauri: channels, events и передача данных во frontend][frontend].
6. [Tauri: управление состоянием][state].
7. [Tauri: capabilities и app command permissions][capabilities].
8. [Tauri: Content Security Policy][csp].
9. [Tauri: оконные функции и drag regions][window].
10. [Tauri: native dialog][dialog], [Opener][opener], [Single Instance][single-instance], [System Tray][system-tray], [Autostart][autostart].
11. [Tauri: updater, подписи и update feed][updater], [Tauri GitHub Releases workflow][tauri-github].
12. [Electron-builder: формат и механика auto-update][electron-updates].
13. [Tauri: Stronghold и получение ключа хранилища][stronghold].
14. [Tauri: WebView2/WebKit на разных ОС][webview].
15. [Tauri: системные предпосылки сборки][prerequisites].
16. [Tauri: Windows installers и доставка WebView2][windows-installer].
17. [Tauri: подпись Windows][windows-signing], [подпись и notarization macOS][macos-signing].
18. [Tauri: WebDriver и актуальные способы E2E на платформах][webdriver].
19. [Rust: Command и передача аргументов процесса][process].
20. [Tokio: I/O, задачи, блокирующая работа и процессы][tokio].
21. [reqwest: HTTP-клиент][reqwest].
22. [authlib-injector: upstream проекта][authlib].
23. [Tauri CLI: реализация разрешения путей][cli-paths], [dev hook][cli-dev], [build hook][cli-hooks] — сверка custom layout по исходникам версии 2.10.1, не утверждение, что это последняя версия.
24. [Electron: userData и app name][electron-app] — основание для сохранения legacy пути настроек.
25. [Microsoft WebView2: временный CDP debug port через environment variable][webview2-cdp] — используется только в Windows packaged smoke test.
26. [Electron safeStorage API][electron-safe-storage] и [Electron 46: переход с sync на async safeStorage][electron-safe-storage-migration].
27. [Rust keyring: платформенные хранилища секретов и Windows Credential Manager][keyring].
28. [Microsoft Credential Manager: запись в набор учётных данных пользователя][windows-credentials].
29. [Paper: запуск сервера и требования к Java][paper-server], [Paper Downloads Service V3][paper-downloads].
30. [Adoptium API: получение и проверка Temurin][adoptium-api].
31. [authlib-injector: конфигурация Paper/Spigot сервера][authlib-server].

### Исходники NatuxWorld

- [Правила репозитория](../AGENTS.md), [текущая передача и release/acceptance](BUYER_HANDOVER.md).
- [Launcher package](../package.json), [Website package](../website/package.json), [Prisma schema](../website/prisma/schema.prisma), [Paper plugin](../website/natux-plugin/pom.xml).
- [Native API types](../src/types/electron.d.ts), [bridge](../src/services/electron-bridge.ts), [preload](../electron/preload.ts), [IPC handlers](../electron/ipc/handlers.ts).
- [Tauri API types](../src/types/native.ts), [Tauri bridge](../src/services/tauri-bridge.ts), [settings and OS integration](../src/native/src/settings.rs), [tray/autostart](../src/native/src/os_integration.rs), [Java picker/probe](../src/native/src/java_picker.rs), [external links/screenshots](../src/native/src/shell_integration.rs), [account service](../src/native/src/account.rs), [account transport](../src/native/src/account/transport.rs), [diagnostics](../src/native/src/diagnostics.rs), [reporting](../src/native/src/reporting.rs), [game launcher](../src/native/src/launcher.rs), [Tauri bridge tests](../src/__tests__/tauri-bridge.test.ts), [Windows packaged Tauri smoke test](../tests/e2e/tauri-packaged.test.cjs).
- [Tauri game-process supervisor](../src/native/src/launcher/process.rs), [OS process-tree guards](../src/native/src/launcher/process/process_tree.rs), [process regression tests](../src/native/src/launcher/process/tests.rs).
- [Java release probe](../src/native/src/java/probe.rs), [bounded Java archive installer](../src/native/src/java/archive/installer.rs), [TAR preflight](../src/native/src/java/archive/preflight.rs), [cancellation and extraction tests](../src/native/src/java/archive/tests.rs).
- [Launcher pipeline](../electron/services/LauncherService.ts), [Minecraft launch](../electron/services/MinecraftService.ts), [Forge](../electron/services/ForgeService.ts), [Java](../electron/services/JavaService.ts).
- [Downloads](../electron/services/DownloadService.ts), [Mojang metadata](../electron/services/MojangService.ts), [resources](../electron/services/LauncherResources.ts).
- [Account/session](../electron/services/AccountService.ts), [settings](../electron/services/SettingsService.ts), [paths](../electron/utils/paths.ts), [playtime](../electron/services/PlaytimeService.ts).
- [Update](../electron/services/UpdateService.ts), [trust](../electron/services/UpdateTrust.ts), [packaging](../electron-builder.yml), [build workflow](../.github/workflows/build.yml).
- [Tauri updater implementation](../src/native/src/updater.rs), [shared Ed25519 control verifier](../src/native/src/updater/control_signature.rs), [platform update policy](../src/native/src/updater/policy.rs), [Tauri updater config](../src/native/tauri.conf.json), [Tauri v2 feed generator](../scripts/generate-tauri-feed.mjs), [CI control verifier](../scripts/tauri-control-verifier/src/main.rs), [feed tests](../tests/scripts/generate-tauri-feed.test.mjs), [installed NSIS smoke](../tests/e2e/tauri-installed.test.cjs), [Electron/Tauri API parity test](../tests/scripts/native-api-parity.test.mjs).
- [React launch tests](../src/__tests__/App.launch-flow.test.tsx), [Electron packaged/live tests](../tests/e2e/packaged.test.cjs), [Tauri packaged/live tests](../tests/e2e/tauri-packaged.test.cjs), [Tauri live acceptance](../tests/e2e/tauri-live.test.cjs), [local Paper staging preparation](../scripts/prepare-tauri-live-server.ps1).
- [Launcher brand](../brand.config.ts), [website brand](../website/src/lib/brand.ts).

[tauri]: https://v2.tauri.app/start/
[vite]: https://v2.tauri.app/start/frontend/vite/
[custom-paths]: https://v2.tauri.app/release/tauri-cli/v2.0.4/
[commands]: https://v2.tauri.app/develop/calling-rust/
[frontend]: https://v2.tauri.app/develop/calling-frontend/
[state]: https://v2.tauri.app/develop/state-management/
[capabilities]: https://v2.tauri.app/security/capabilities/
[csp]: https://v2.tauri.app/security/csp/
[window]: https://v2.tauri.app/learn/window-customization/
[dialog]: https://v2.tauri.app/plugin/dialog/
[opener]: https://v2.tauri.app/plugin/opener/
[single-instance]: https://v2.tauri.app/plugin/single-instance/
[system-tray]: https://v2.tauri.app/learn/system-tray/
[autostart]: https://v2.tauri.app/plugin/autostart/
[updater]: https://v2.tauri.app/plugin/updater/
[tauri-github]: https://v2.tauri.app/distribute/pipelines/github/
[electron-updates]: https://www.electron.build/docs/features/auto-update/
[stronghold]: https://v2.tauri.app/plugin/stronghold/
[webview]: https://v2.tauri.app/reference/webview-versions/
[prerequisites]: https://v2.tauri.app/start/prerequisites/
[windows-installer]: https://v2.tauri.app/distribute/windows-installer/
[windows-signing]: https://v2.tauri.app/distribute/sign/windows/
[macos-signing]: https://v2.tauri.app/distribute/sign/macos/
[webdriver]: https://v2.tauri.app/develop/tests/webdriver/
[process]: https://doc.rust-lang.org/std/process/struct.Command.html
[tokio]: https://docs.rs/tokio/latest/tokio/
[reqwest]: https://docs.rs/reqwest/latest/reqwest/
[authlib]: https://github.com/yushijinhun/authlib-injector
[cli-paths]: https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.10.1/crates/tauri-cli/src/helpers/app_paths.rs
[cli-dev]: https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.10.1/crates/tauri-cli/src/dev.rs
[cli-hooks]: https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.10.1/crates/tauri-cli/src/helpers/mod.rs
[electron-app]: https://www.electronjs.org/docs/latest/api/app
[electron-safe-storage]: https://www.electronjs.org/docs/latest/api/safe-storage
[electron-safe-storage-migration]: https://github.com/electron/electron/blob/main/docs/breaking-changes.md
[webview2-cdp]: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code
[keyring]: https://docs.rs/keyring/latest/keyring/v1/index.html
[windows-credentials]: https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew
[paper-server]: https://docs.papermc.io/paper/getting-started/
[paper-downloads]: https://docs.papermc.io/misc/downloads-service/
[adoptium-api]: https://adoptium.net/installation/ci-scripts/
[authlib-server]: https://yushijinhun.github.io/authlib-injector/en/using-authlib-injector-on-a-minecraft-server.html
