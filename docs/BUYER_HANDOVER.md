# NATUX WORLD — передача проекта

Документ описывает текущие исходники 1.10.0: основной лаунчер Tauri 2 + Rust, сайт и связанные сервисы. Локальная реализация и production-публикация имеют отдельные проверки.

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
5. `npm run test:tauri:installed`: Windows NSIS install/smoke/uninstall с сохранением профиля; CI проверяет конечный пакет и ожидаемый native hash. macOS workflow предусматривает отдельную приёмку Intel и Apple Silicon приложения из конечного DMG с отдельным HOME и сверку подписи/receipt. Эти новые проверки ожидают CI-прогона. Новая локальная NSIS-приёмка 1.10.0 остановлена guard: в обычной Windows-учётной записи уже зарегистрирована NATUX WORLD 1.9.15. Используйте чистую изолированную среду/CI; не удаляйте пользовательскую установку ради теста. Эти проверки не заменяют чистую ОС и live Minecraft.
6. `npm run build:portable` и `npm run test:portable`: Windows x64 ZIP, распаковка, запуск и перенос каталога с сохранением профиля/WebView cache рядом с executable. Для Portable автообновление и автозапуск отключены; обновление выполняется вручную с сохранением папки профиля. Запускайте `Start NATUX WORLD.cmd` / `start-portable.ps1`: при отсутствии WebView2 helper запрашивает согласие на установку и проверяет подпись Microsoft Authenticode перед запуском bootstrapper. Probe существующего runtime проверен; установка на машине без runtime ещё не испытана.
7. `npm run test:tauri:upgrade`: отдельная приёмка действительного подписанного Tauri→Tauri обновления. Нужны предыдущий и новый updater-пакеты с действительными подписями, isolated environment и ожидаемые хеши. Пропущенный тест не подтверждает upgrade; параметры перечислены в `tests/e2e/tauri-upgrade.test.cjs`.
8. `npm run test:packaged:live` (алиас `test:tauri:live`): настоящий вход, установка, запуск Minecraft и новая запись подключения в серверном логе. Пользователь **отложил этот сценарий**; он не запускался и не считается пройденным.

Windows installer использует `config/tauri-installer-hooks.nsh`: проверяет точный HKCU GUID опубликованного Electron, его metadata и файлы, вызывает штатное удаление без `--delete-app-data` и переносит только подходящую запись автозапуска. Семь проверок с настоящими скомпилированными NSIS-фикстурами прошли; повреждённые команды отклоняются до удаления. Сценарий `tests/e2e/tauri-electron-migration.test.cjs` устанавливает опубликованный Electron 1.9.15 и новый NSIS поверх него без ручного удаления; он включён только в чистом hosted Windows CI и ещё ожидает своего прогона. Его шесть проверок границ прошли локально. Обычное открытие приложения не меняет автозапуск ОС. Матрица macOS на PR и релизах запускает конечные DMG отдельно на native Intel и ARM; наличие workflow не заменяет успешный runtime-прогон.

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

Сертификаты подписи Windows/macOS необязательны в выбранной модели выпуска. Без них Windows installer не имеет Authenticode и может показать SmartScreen, а macOS получает ad-hoc подпись без Developer ID/notarization и может потребовать разрешения в Privacy & Security. Эти ограничения не отключают криптографические подписи обновлений.

Проверяемая source policy `config/launcher-release-policy.json` содержит `tauri: true`, `migrationEnabled: true`, `rolloutPct: 100`; она используется по умолчанию. `TAURI_UPDATES_ENABLED`, `TAURI_MIGRATION_ENABLED` и `TAURI_ROLLOUT_PCT` могут явно переопределить её. Отсутствие repository variables больше не выключает основной Tauri release-путь. Публикация всё равно требует ключей, допустимой новой версии на `main` и успешных обязательных CI-проверок; rollout/миграцию применять только после приёмки. Политика исходников ещё не применялась внешним релизом. `CODE_SIGNING_ENABLED=true` включает обязательную проверку сертификатов ОС:

| Платформа | Secrets |
|---|---|
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `MAC_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

Для подписанного выпуска проверяйте итоговые артефакты через `Get-AuthenticodeSignature`, `codesign`, `spctl` и `xcrun stapler validate`. Подпись не гарантирует отсутствие SmartScreen-предупреждения. Windows NSIS поддерживает автоматические обновления; macOS и Windows Portable направляют на страницу конкретного релиза для ручного обновления. Linux release/acceptance-путь не заявлен.

Rollback имеет собственный `config/electron-builder.signed.cjs`; после `electron:build:web` его можно упаковать через `npm run electron:package -- --config config/electron-builder.signed.cjs --win --x64 --publish never`. Не применяйте Electron-профиль к основному Tauri installer.

Официальные инструкции: [Windows signing](https://v2.tauri.app/distribute/sign/windows/), [macOS signing](https://v2.tauri.app/distribute/sign/macos/), [Tauri updater](https://v2.tauri.app/plugin/updater/).

## Проверенная граница текущего состояния

GitHub Build от **13 октября 2026** на `c70ec65` (1.9.15) прошёл Windows/macOS validation. Updater release publication была пропущена; secrets `TAURI_SIGNING_PRIVATE_KEY` и `UPDATE_SIGNING_PRIVATE_KEY` существуют, release variables отсутствовали при последней проверке. Это исправляет прежнюю запись о том, что workflow ещё никогда не запускался.

Исходники 1.10.0 переключены на Tauri. Windows packaged/portable, installed NSIS + Electron rollback и native Intel/Apple Silicon DMG прошли в [CI 2dd4f3c](https://github.com/Alex-dev-sys/NatuxWorld/actions/runs/38745152727). Общий прогон остановился на quoted InstallLocation в миграционном test harness; актуальную приёмку исправления и следующих коммитов проверять в [PR №8](https://github.com/Alex-dev-sys/NatuxWorld/pull/8). Source release policy включена; отсутствующие repository variables не выключают Tauri. Local unit/build/smoke результаты не доказывают подписанный Tauri→Tauri upgrade или установку WebView2 на чистой Windows. Для последней нет готовой одноразовой VM. Настоящая установленная Electron→Tauri миграция, Tauri→Tauri upgrade и публичная доступность новых feed/артефактов остаются release gates; live Minecraft отложен пользователем.

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

- [ ] Проверки и сборки лаунчера и сайта проходят отдельно.
- [ ] Smoke-тест упакованного приложения проходит на целевых ОС.
- [ ] Live-сценарий вход → установка → запуск → подключение проверен.
- [ ] Переход Electron→Tauri и подписанное Tauri→Tauri обновление установлены с сохранением профиля.
- [ ] GitHub Release содержит Tauri NSIS + `.sig`, Portable ZIP, macOS `.dmg`, updater archive + `.sig`, checksums и native hash; стабильный/бета channel содержит `latest.json`, подписанные `natux-tauri-control.json` / `.sig`. Legacy Electron migration manifest выпускается только при разрешённой миграции.
- [ ] Для подписанного выпуска проверены подписи и macOS notarization.
- [ ] Новый владелец получил доступы и сменил чувствительные секреты.

## Как выпустить обновление

1. Внести изменения, пройти проверки и изменить версию:
   `npm version <version> --no-git-tag-version`.
2. Создать PR в `main`: CI проверяет сборку без публикации.
3. Проверить source release policy, при необходимости задать явные operator overrides и проверить наличие ключей. После приёмки влить PR. Build workflow на `main` публикует Tauri при разрешённой политике, новой версии и успешных checks, затем создаёт тег. `workflow_dispatch` подчиняется тем же gates.
4. Проверить публичные feed/подписи/checksums, загрузку, установку и обновление с предыдущей Windows-версии; только затем переключать выдачу downloads и миграционный rollout.

Сайт проверяется отдельным workflow; production-развёртывание выполняет
подключённый Vercel-проект. Изменения только в `website/` не выпускают лаунчер.

## Материалы для передачи

Обновите скриншоты входа, главного экрана, настроек, обновления, магазина и
админ-панели из `website/`. Не публикуйте секреты, RCON-данные, пользовательские
e-mail и реальные платёжные заказы.
