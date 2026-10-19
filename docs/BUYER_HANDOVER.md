# NATUX WORLD — передача проекта

Документ описывает опубликованный релиз 1.10.0: основной лаунчер Tauri 2 + Rust, сайт и связанные сервисы. Реализация, проверки desktop-поставки и готовность production-инфраструктуры учитываются отдельно.

## Что входит в репозиторий

| Часть | Роль |
|---|---|
| `src/`, `src/native/` | React + Tauri/Rust: установка Java/Minecraft/Forge 1.21.1, запуск, настройки, логи, обновления |
| `electron/` | Необязательный rollback-пакет с отдельным `package.json`; основные зависимости и сборка его не используют |
| `website/` | Next.js-сайт, аккаунты, e-mail, Yggdrasil authserver, магазин, PostgreSQL/Prisma, RCON и админ-панель |
| `website/natux-plugin/` | Серверный плагин; его сборка проверяется в Website CI |
| `.github/workflows/build.yml` | Проверки, упаковка Windows/macOS и выпуск лаунчера |
| `.github/workflows/website.yml` | Проверки сайта и плагина |

Сайт уже находится в `website/`. Старые ссылки на отдельный `minecraft-server`
не являются инструкцией по расположению актуального кода. Для передачи нужны
этот репозиторий и доступы к работающей инфраструктуре; содержимое и резервные
копии игрового сервера передаются отдельно.

## Быстрый старт для разработчика

Лаунчер, из корня репозитория. Нужны Rust toolchain, C++ build tools и Java JDK для lock-agent; на Windows — WebView2:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run dev
```

Сайт, из `website/`:

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

Для сайта настройте окружение по его примеру конфигурации; нужны PostgreSQL и
сгенерированный Prisma client. Не переносите production-секреты в Git.
Сайт имеет отдельные зависимости и проверки: успешная сборка лаунчера не
проверяет `website/`.

## Бренд и адреса

- Лаунчер: `config/launcher-brand.json` — общий источник Rust/TypeScript; `brand.config.ts` предоставляет `BRAND` и `BRAND_URLS`. Локальные API/сервер задаются в том же JSON.
- Сайт: `website/src/lib/brand.ts` — `NEXT_PUBLIC_SERVER_NAME`,
  `NEXT_PUBLIC_SITE_DOMAIN`, `NEXT_PUBLIC_SERVER_IP`, `NEXT_PUBLIC_SERVER_VERSION`.
- Release policy: `config/launcher-release-policy.json` включает Tauri, migration и rollout 100% по умолчанию; repository variables — явные overrides.
- Основной установщик, identifier, WebView2 и ресурсы: `src/native/tauri.conf.json`; выпуск — `.github/workflows/build.yml`. `electron-builder.yml` относится только к rollback.

Единые конфиги уже существуют. При ребрендинге измените их согласованно перед
сборкой, а также проверьте социальные ссылки и графические ресурсы: они не все
вынесены в `BRAND`. Изменение build-time значений требует новой сборки.

## Какие проверки что подтверждают

1. `npm test`: React/Zustand, native bridge и валидаторы. UI-тесты подменяют native bridge; они покрывают вход, 2FA, установку, повтор, отмену и running state.
2. `cargo test --manifest-path src/native/Cargo.toml --locked`: Rust-службы, включая загрузки, процессы, хранение, updater и validation boundaries. Требуются также `cargo fmt --manifest-path src/native/Cargo.toml --check` и `cargo clippy --manifest-path src/native/Cargo.toml --all-targets --locked -- -D warnings`.
3. `npm run build:web`: production frontend Tauri. `npm run build`: frontend, Rust и пакет текущей ОС. Для Windows NSIS можно задать `npm run build -- --bundles nsis`.
4. `npm run test:packaged`: запускает Tauri executable с отдельным профилем, проверяет WebView/native bridge и сохранность синтетических legacy данных. На Windows executable по умолчанию — `src/native/target/release/natux-world-launcher-native.exe`; override — `NATUX_TAURI_E2E_EXECUTABLE`.
5. `npm run test:tauri:installed`: Windows NSIS install/smoke/uninstall с сохранением профиля; CI проверяет конечный пакет и ожидаемый native hash. Windows install/uninstall с Electron rollback и обе native Intel/Apple Silicon DMG-приёмки прошли в [Build 21326ad](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/38934730364). Локальная NSIS-приёмка 1.10.0 остановлена guard: в обычной Windows-учётной записи уже зарегистрирована NATUX WORLD 1.9.15. Используйте чистую изолированную среду/CI; не удаляйте пользовательскую установку ради теста. Эти проверки не заменяют чистую ОС и live Minecraft.
6. `npm run build:portable` и `npm run test:portable`: Windows x64 ZIP, распаковка, запуск и перенос каталога с сохранением профиля/WebView cache рядом с executable. Для Portable автообновление и автозапуск отключены; обновление выполняется вручную с сохранением папки профиля. Запускайте `Start NATUX WORLD.cmd` / `start-portable.ps1`: при отсутствии WebView2 helper запрашивает согласие на установку и проверяет подпись Microsoft Authenticode перед запуском bootstrapper. [Portable acceptance 255db37](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39045619704) подтвердил отсутствие runtime, настоящий отказ без установки, согласие с установкой WebView2, запуск UI, совпадение native/ZIP SHA512 и cleanup. Исправлена загрузка native Authenticode module в Windows PowerShell 5 при унаследованном PSModulePath от PowerShell 7.
7. `npm run test:tauri:upgrade`: отдельная приёмка действительного подписанного Tauri→Tauri обновления. Предварительно соберите CLI verifier: `cargo build --manifest-path src/native/Cargo.toml --locked --bin verify-updater-signature`. Нужны предыдущий и новый updater-пакеты с действительными подписями, выделенная обычная Windows-учётная запись без административного токена и ожидаемые хеши. Пропущенный тест не подтверждает upgrade; параметры проверяются в `tests/e2e/tauri-upgrade-config.cjs`.
8. `npm run test:packaged:live` (алиас `test:tauri:live`): настоящий вход, установка, запуск Minecraft и новая запись подключения в серверном логе. Пользователь **отложил этот сценарий**; он не запускался и не считается пройденным.

Windows installer использует `config/tauri-installer-hooks.nsh`: проверяет точный HKCU GUID опубликованного Electron, его metadata и файлы, вызывает штатное удаление без `--delete-app-data` и переносит только подходящую запись автозапуска. 43 скомпилированные NSIS safety/preflight проверки и migration boundary checks прошли. Сценарий `tests/e2e/tauri-electron-migration.test.cjs` устанавливает опубликованный Electron 1.9.15 и новый NSIS поверх него без ручного удаления; он прошёл в чистом hosted Windows CI на `21326ad`, включая native hash, профиль, автозапуск, ярлыки и удаление старого payload. Обычное открытие приложения не меняет автозапуск ОС.

Отдельный Build `workflow_dispatch` с непустым `webview_acceptance_run` проверяет установку NSIS без WebView2 и не запускает release planning/publishing. Укажите успешный Build run из этого же source commit: `gh workflow run build.yml --ref <branch> -f webview_acceptance_run=<run-id>`. На одноразовом официальном Windows runner `prepare-webview2-ci.ps1` использует только проверенный Microsoft vendor uninstaller, затем подтверждает отсутствие всех pv registrations и runtime EXE. Неизменённый NSIS запускается при Medium integrity; проверяются установленный runtime, native SHA512, UI и удаление только тестового Tauri. ACK удаления действует только в отдельном CI step. [Полный прогон 4130baa](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/38999551367) прошёл: отсутствие runtime → установка WebView2 155.0.4283.62 → точный native hash → UI → завершённый uninstall и удалённый тестовый owner. Receipt подтверждает неизменность installer SHA512 до/после. Гонка удаления каталога раньше uninstall-регистрации устранена ожиданием обоих состояний. Локальную Windows и пользовательскую установку для него не изменять. Для отдельной Portable-приёмки задайте также `-f webview_acceptance_kind=portable`: проверка использует точный ZIP/portableSha512 того же Build, настоящий диалог отказа/согласия и запуск Tauri после установки runtime. Её результат проверять по `portable-webview-result.json`; успешный NSIS-сценарий сам по себе Portable не подтверждает.

После публикации целевого signed release доступен отдельный `.github/workflows/tauri-upgrade.yml`: `target_release=v1.10.0` должен совпадать с checkout. Укажите ровно один источник предыдущей версии: `previous_release=v<version>` для настоящего опубликованного Tauri или `previous_candidate_version=1.10.0-rc.0` для заново собранного кандидата, подписанного действующим ключом. Второй режим нужен для первого native release и проверяет протокол обновления; он не подтверждает совместимость с историческими Tauri-сборками. Workflow использует официальный одноразовый Windows runner и создаёт временную обычную учётную запись: точный SID, Medium integrity и отсутствие административного токена проверяются до установки. Самого понижения integrity через gsudo недостаточно. Обе подписи проверяются заранее собранным CLI verifier со встроенным ключом; приёмка использует настоящий public feed/URL и проверяет автоматический перезапуск, native hash, настройки и игровые fixtures. Success receipts выдаются после uninstall/cleanup, удаления собственной учётной записи/профиля и восстановления прав каталога. [39129437879](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39129437879) прошёл: свежий подписанный 1.10.0-rc.0 → публичный 1.10.0, девять тестов выполнены без ошибок и пропусков. Старая локальная Tauri 1.9.15 signature не прошла проверку действующим ключом и не использовалась.

Для live нужны отдельная Windows-учётная запись, подтверждённый игровой test account без 2FA, новый профиль, изолированный Paper/authlib сервер с принятой EULA и читаемым логом. Не используйте обычные аккаунты или игровые данные. Передавайте `NATUX_TAURI_LIVE_ACCEPTANCE=1`, `NATUX_TAURI_E2E_WINDOWS_ACCOUNT`, `NATUX_TAURI_E2E_SERVER_ROOT`, `NATUX_TAURI_E2E_SERVER_ADDRESS`, `NATUX_TAURI_E2E_DEDICATED_ACCOUNT=YES`, `NATUX_TAURI_E2E_ISOLATED_SERVER=YES`, `NATUX_E2E_LOGIN`, `NATUX_E2E_PASSWORD`, `NATUX_E2E_USERNAME` и `NATUX_E2E_SERVER_LOG` только через локальное окружение. Требования и предварительные проверки находятся в `tests/e2e/tauri-live.test.cjs` и [плане миграции](plans/TAURI_MIGRATION_PLAN.md). Статус `running` означает запуск процесса и сам по себе не подтверждает server join.

## Electron для отката

Electron отделён от основного Tauri-пакета. Устанавливать его зависимости нужно только при работе над откатом:

```bash
npm run electron:install
npm run typecheck:electron
npm run test:electron
npm run electron:build
npm run test:electron:packaged
```

`electron:dev`, `electron:build:web` и `electron:package` также доступны как явные root-команды. Они не являются стандартной разработкой/поставкой. `test:electron:live` — прежняя live-проверка, с теми же ограничениями тестовых аккаунтов. Сохраняйте последний проверенный Electron installer для возврата и проверяйте его совместимость с профилем. Tauri использует legacy installed userData, settings/playtime/installId и игровые файлы; действующий Electron JWT не импортируется, поэтому после перехода нужен один повторный вход. Portable использует собственную папку профиля. Автозагрузка installed-версии мигрируется отдельно от Portable.

## Подпись приложения и обновлений

Tauri updater требует `TAURI_SIGNING_PRIVATE_KEY`; control-feed подписывается отдельным `UPDATE_SIGNING_PRIVATE_KEY`. Приватные ключи хранятся в GitHub Actions secrets. Native executable hash в подписанном control-манифесте используется для проверки установленного executable; это отдельная проверка от подписи скачиваемого updater-пакета.

Windows NSIS во время упаковки получает изменённую Tauri bundle marker `NSS` и, при включённой подписи ОС, Authenticode. После bundling Tauri восстанавливает исходный Cargo exe. Compile-time hook сохраняет точные упакованные байты в `natux-world-launcher-native.exe.nsis-payload.exe`; только этот capture используется для native hash, Authenticode и CI packaged smoke. CI Portable собирается с `node scripts/package-tauri-portable.mjs --nsis-payload`, сохраняя эти байты и подпись. Обычный `build:portable` без NSIS использует свежий standalone exe и не подхватывает старый capture.

Сертификаты подписи Windows/macOS необязательны в выбранной модели выпуска. Без них Windows installer не имеет Authenticode и может показать SmartScreen, а macOS получает ad-hoc подпись без Developer ID/notarization и может потребовать разрешения в Privacy & Security. Эти ограничения не отключают криптографические подписи обновлений.

Проверяемая source policy `config/launcher-release-policy.json` содержит `tauri: true`, `migrationEnabled: true`, `rolloutPct: 100`; repository variables могут явно переопределить её. Эта политика применена при выпуске v1.10.0 18 октября 2026 с отдельного разрешения пользователя на публикацию и 100% rollout. Updater/control-подписи и платформенная приёмка обязательны. Ограниченный opt-in pilot отдельно не проводился; `CODE_SIGNING_ENABLED=true` включает обязательную проверку сертификатов ОС:

| Платформа | Secrets |
|---|---|
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

Для подписанного выпуска проверяйте итоговые артефакты через `Get-AuthenticodeSignature`, `codesign`, `spctl` и `xcrun stapler validate`. Подпись не гарантирует отсутствие SmartScreen-предупреждения. Windows NSIS поддерживает автоматические обновления; macOS и Windows Portable направляют на страницу конкретного релиза для ручного обновления. Linux release/acceptance-путь не заявлен.

Rollback имеет собственный `config/electron-builder.signed.cjs`; после `electron:build:web` его можно упаковать через `npm run electron:package -- --config config/electron-builder.signed.cjs --win --x64 --publish never`. Не применяйте Electron-профиль к основному Tauri installer.

Официальные инструкции: [Windows signing](https://v2.tauri.app/distribute/sign/windows/), [macOS signing](https://v2.tauri.app/distribute/sign/macos/), [Tauri updater](https://v2.tauri.app/plugin/updater/).

## Проверенная граница текущего состояния

Релизный [Build 39108098364](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39108098364) на `d958b8dbf758fa8ea88765f7a909091188e2f4e1` полностью прошёл: Windows packaged/portable/install/uninstall/rollback, настоящая Electron 1.9.15 → Tauri миграция с сохранением профиля, native Intel/Apple Silicon DMG и реальные Windows Credential Manager / macOS Keychain round-trips. Оба native macOS receipts подтверждают по одному выполненному credential-тесту и полный cleanup. [v1.10.0](https://github.com/Alex-dev-sys/NatuxWorld/releases/tag/v1.10.0) опубликован 18 октября 2026 в 08:02:49 UTC.

Независимая загрузка публичных файлов без GitHub-авторизации подтвердила все 16 Tauri assets и их checksums, три updater-подписи встроенным ключом, подпись control-feed, совпадение channel/versioned metadata, native hashes, migration=true и rollout=100. Скачанные NSIS/Portable SHA512 совпали с принятыми CI-пакетами. Прежний Electron latest feed, подпись manifest и SHA512 указанного installer также проверены. [Production NSIS без WebView2 39109977458](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39109977458) прошёл; [Production Portable без WebView2 39110002890](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39110002890) тоже прошёл: реальные No/Yes consent, установка runtime, точный ZIP/native hash, UI, policy и cleanup. [Tauri→Tauri 39129437879](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39129437879) на `eec4b19` прошёл под настоящей временной учётной записью без административного токена: подписанный кандидат 1.10.0-rc.0 автоматически обновился до публичного 1.10.0 и перезапустился без ручного запуска целевой версии. Совпали SHA512 опубликованных installer/native executable; сохранились настройки, consents, installId и файлы mods/config/world. Uninstall, удаление обоих временных аккаунтов/профилей и восстановление ACL подтверждены отдельными receipts. [Полный Build 39129441797](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39129441797) того же коммита тоже прошёл на Windows и обеих native архитектурах macOS; существующий публичный релиз не перезаписывался. Website/Paper CI проверены отдельно в [39046155649](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/39046155649); их production backend readiness не подтверждена. Реальная Java-приёмка скачала/проверила Temurin 21.0.12.1 и установила/обнаружила его только в синтетическом temp-профиле, удалённом после теста. Live Minecraft пользователь отложил. Адреса `vibestudy.ru` / `mc.vibestudy.ru` сохранены по его указанию.

## Передача доступов

Передавайте через защищённый менеджер паролей:

1. Права владельца этого GitHub-репозитория и GitHub Actions.
2. Резервные копии `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY`, а также доступ к сертификатам подписи,
   если они настроены; секреты нельзя извлечь из GitHub после сохранения.
3. Домен/DNS, хостинг сайта, PostgreSQL, почту и платёжные кабинеты.
4. Игровой сервер, RCON и authlib-injector, если используются.
5. Vercel/VPS, актуальные резервные копии БД и игровых миров.

Если ключ обновлений утрачен, нужна отдельная процедура ротации с выпуском
лаунчера, доверяющего новому ключу.

## Проверка перед передачей и выпуском

- [x] Проверки и сборки лаунчера и сайта проходят отдельно; ссылки на принятые desktop/Website CI приведены выше.
- [x] Smoke-тест конечного Windows NSIS/Portable и native macOS Intel/Apple Silicon DMG прошёл в релизном Build 39108098364.
- [ ] Live-сценарий вход → установка → запуск → подключение пользователь явно отложил; он не считается пройденным.
- [x] Переход опубликованного Electron 1.9.15 → Tauri и подписанное обновление свежего Tauri-кандидата 1.10.0-rc.0 → публичный 1.10.0 приняты с сохранением профиля; историческая Tauri-совместимость не заявляется.
- [x] Публичный v1.10.0 содержит Tauri NSIS + `.sig`, Portable ZIP, обе macOS DMG/updater archives + `.sig`, checksums/native hashes; stable channel содержит `latest.json`, подписанные control JSON/`.sig`. Прежний Electron feed сохранён и проверен.
- [x] Криптографические updater/control/legacy подписи проверены. В выбранном режиме сертификаты ОС необязательны; Authenticode/Developer ID/notarization не использовались.
- [ ] Новый владелец получил доступы и сменил чувствительные секреты.

## Как выпустить обновление

1. Внести изменения, пройти проверки и изменить версию:
   `npm version <version> --no-git-tag-version`.
2. Создать PR в `main`: CI проверяет сборку без публикации.
3. Проверить source release policy, при необходимости задать явные operator overrides и проверить наличие ключей. После приёмки влить PR. Build workflow на `main` публикует Tauri при разрешённой политике, новой версии и успешных checks, затем создаёт тег. `workflow_dispatch` подчиняется тем же gates. Опубликованные versioned assets неизменяемы: полный release пропускается, неполный published release требует новой версии, продолжать можно только draft. Перед upload состояние draft проверяется повторно. Пересборка той же версии меняет native hash, а equal-version клиент не обновляется; поэтому изменение rollout/migration policy через этот Build применяется с новой версией, без перезаписи старых installers.
4. Проверить публичные feed/подписи/checksums, загрузку, установку и обновление с предыдущей Windows-версии; только затем переключать выдачу downloads и миграционный rollout.

Сайт проверяется отдельным workflow; production-развёртывание выполняет
подключённый Vercel-проект. Изменения только в `website/` не выпускают лаунчер.

## Материалы для передачи

Обновите скриншоты входа, главного экрана, настроек, обновления, магазина и
админ-панели из `website/`. Не публикуйте секреты, RCON-данные, пользовательские
e-mail и реальные платёжные заказы.
