# Adversarial code review — NATUX WORLD Website

Дата: 20 августа 2026  
Репозиторий: https://github.com/Alex-dev-sys/minecraft-server  
Локальная копия: NatuxWorld/website  
Ветка и ревизия: main, d8458efa663f8744cbf7dc8caa66fff7fc69b11b

## Итог

Текущую ревизию нельзя выпускать в production без исправления Critical и High-находок.

| Уровень | Количество |
|---|---:|
| Critical | 1 |
| High | 9 |
| Medium | 18 |
| Low | 6 |
| Всего | 34 |

Самая опасная цепочка возникает при отсутствующем PAYMENT_PROVIDER: публичный mock-webhook считает mock включённым, а RCON — выключенным. В такой конфигурации неавторизованный посетитель может отметить собственный заказ оплаченным и получить настоящий игровой ранг бесплатно.

Другие приоритетные риски: вход по повторному email-коду без пароля и TOTP, закрепление через app-password, известные уязвимости Next.js, неидемпотентная выдача рангов, обход maxUses купонов, сохранение паролей из игровых команд и публичные DoS-поверхности.

## Объём и методика

Проверены:

- Next.js 14 App Router, React-клиенты и middleware;
- 63 API route, авторизация пользователей и админов, 2FA, Yggdrasil;
- Prisma-схема, платежи, заказы, купоны, RCON и SSH-мост;
- Paper-плагин, телеметрия, crash reports;
- Docker, nginx, VPS-скрипты, CI, backup и env-конфигурация;
- зависимости, тесты и история репозитория на признаки секретов.

Это статическое и локальное adversarial review. Активные атаки на production, реальную БД, платежные кабинеты, SMTP, Minecraft/RCON и SSH не выполнялись.

## Выполненные проверки

| Проверка | Результат |
|---|---|
| npm run typecheck | PASS |
| npm run lint | PASS, одно предупреждение о custom font |
| npm test | PASS: 38 файлов, 143 теста |
| npm run build | PASS; Google Fonts не скачался, build завершился |
| npm audit --omit=dev | 8 High, 5 Moderate |
| Полный npm audit | 1 Critical, 14 High, 8 Moderate, включая dev tooling |
| npm run check-secrets | Ожидаемо FAIL: production secrets отсутствуют в копии |
| Поиск секретов в tracked files и git history | Реальных секретов не найдено; только placeholder в .env.example |
| Prisma generate | PASS |
| Java/Paper build | Не выполнен: Maven и wrapper отсутствуют |
| Semgrep, gitleaks, trivy | Недоступны в окружении |

## Critical

### WEB-001 — Fail-open mock payment запускает настоящий RCON

- Доказательство: src/app/api/orders/route.ts:169-197 переводит отсутствующий provider в mock; src/app/api/payments/webhook/mock/route.ts:6-31 также разрешает undefined как mock; src/lib/rcon.ts:53-80 включает mock RCON только при точном значении mock. Публичный UI вызывает webhook в src/components/PaymentClient.tsx:353-365.
- Сценарий: в production PAYMENT_PROVIDER отсутствует, но RCON настроен. Атакующий создаёт заказ, отправляет его ID в публичный mock-webhook и получает реальный ранг без оплаты.
- Условия: особенно опасно для Vercel/Node runtime с действительно отсутствующей переменной. Пустая строка в Docker обычно приводит к отказу checkout, а не к этой цепочке.
- Исправление: строгая startup-схема env; production не стартует при missing, empty или unknown provider; mock endpoint и UI недоступны в production; отдельный явный ALLOW_MOCK_PAYMENTS только для dev/test; RCON_MOCK не связывать с платежным provider.
- Проверка исправления: production-тесты для undefined, empty, typo и yoomoney обязаны падать до запуска сервера и доказывать, что executeRcon не вызывается.

## High

### WEB-002 — Повторный email-код выдаёт сессию без пароля и обходит 2FA

- Доказательство: src/app/api/auth/resend-code/route.ts:23-29 создаёт verifyCode для уже подтверждённого пользователя; src/app/api/auth/verify-email/route.ts:22-45 не требует emailVerified=false, пароль или TOTP и возвращает 30-дневный JWT.
- Сценарий: известный email → resend-code → доступ или перехват письма → verify-email → полный вход, в том числе в TOTP-аккаунт.
- Исправление: endpoints только для незавершённой регистрации; purpose-bound одноразовый enrollment token, хеш, account-wide лимит и атомарное consume. Recovery подтверждённого аккаунта должен быть отдельным flow с отзывом сессий.

### WEB-003 — Украденная JWT превращается в постоянный game credential

- Доказательство: src/app/api/auth/app-passwords/route.ts:19-29 создаёт app-password без свежего пароля/TOTP. Logout и reset-password не удаляют его: src/app/api/auth/logout/route.ts:20-23, src/app/api/admin/users/[id]/route.ts:177-187. Yggdrasil принимает старый app-password и выпускает новый GameToken: src/app/api/yggdrasil/authserver/authenticate/route.ts:43-76.
- Воздействие: кратковременная кража bearer JWT закрепляет доступ даже после logout, reset password и обычного tokenVersion revoke.
- Исправление: step-up authentication, лимит и срок app-password; удалять их при password recovery, reset/disable 2FA и компрометации; все revoke-операции выполнять одной транзакцией.

### WEB-004 — Уязвимый Next.js доступен через self-hosted WebSocket path

- Доказательство: package.json:25 фиксирует Next 14.2.35. nginx.conf:42-51 и vps-setup.sh:39-50 проксируют attacker-controlled Upgrade в built-in Node server.
- Применимость: GHSA-c4j6-fc7j-m34r / CVE-2026-44578 даёт SSRF для self-hosted Next.js; эта версия также попадает под App Router DoS GHSA-q4gf-8mx6-v5v3. Vercel-hosted вариант не подвержен WebSocket SSRF, Docker/VPS — подвержен.
- Источники: https://github.com/advisories/GHSA-c4j6-fc7j-m34r и https://github.com/advisories/GHSA-q4gf-8mx6-v5v3
- Исправление: перейти на поддерживаемую исправленную версию, заблокировать WebSocket Upgrade в nginx, если он не нужен, и ограничить egress к internal/metadata сетям.

### WEB-005 — Выдача ранга не является exactly-once

- Доказательство: src/lib/rcon.ts:72-102 повторяет весь список после любой ошибки; src/lib/fulfillment.ts:36-52 выполняет RCON до финального DB update; src/lib/store.ts:101-112 после delivery_pending больше не принимает webhook; admin retry делает безусловный повтор в src/app/api/admin/orders/[id]/retry-delivery/route.ts:15-29.
- Сценарии: команда 1 выполнилась, команда 2 упала — повтор дублирует первую; процесс умер после RCON — заказ остаётся pending; ручной retry может повторить grant. LuckPerms addtemp accumulate способен продлить привилегию повторно.
- Исправление: durable outbox/worker, lease и CAS, checkpoint по командам, идемпотентный grant-if-absent(orderId) на стороне Minecraft, watchdog для stale pending.

### WEB-006 — Платные купоны можно заранее накопить и превысить maxUses

- Доказательство: скидка фиксируется при создании заказа в src/app/api/orders/route.ts:101-150; при оплате src/lib/store.ts:101-112 игнорирует false от redeemCoupon и всё равно выдаёт заказ. Сам SQL в src/lib/couponStore.ts:32-35 атомарный, но результат не enforced.
- Сценарий: при maxUses=1 создать много discounted orders до первой оплаты, затем оплатить все. Только один use инкрементируется, но все заказы исполняются по сниженной цене.
- Дополнительно free coupon списывается до saveOrder, поэтому DB/process failure сжигает код без заказа.
- Исправление: транзакционная reservation с expiry, привязанная к order/payment; release abandoned orders; никогда не игнорировать failed redemption.

### WEB-007 — Paper-плагин сохраняет пароли, приватные сообщения и координаты

- Доказательство: natux-plugin/src/main/java/ru/vibestudy/natuxplugin/PlayerListener.java:38-50 пишет полный command/chat и исключает только lowercase /w и /tell; config.yml:5-18 включает это по умолчанию. Backend сохраняет message и координаты в src/app/api/game-event/route.ts:41-65 и prisma/schema.prisma:88-105.
- Сценарии: /login password, /register, /changepassword, /msg, aliases и case-варианты уходят в БД и админку.
- Исправление: не собирать аргументы команд; allowlist безопасных событий; raw chat/commands выключить по умолчанию; redaction, consent, retention и аудит доступа.

### WEB-008 — Публичные endpoints дают распределённый CPU/DB/provider DoS

- Корень: src/lib/ratelimit.ts:6-32 хранит buckets в process-local Map; лимиты сбрасываются при restart/cold start и обходятся через replicas/serverless.
- Поверхности: unauthenticated crash-report до примерно 600 KB записи; checkout создаёт БД-строки и внешние invoices; YooKassa webhook инициирует provider lookup; Ygg signout делает bcrypt без limiter; verify-email раздувает Map и LoginEvent; profile-by-UUID читает всех пользователей.
- Доказательство: src/app/api/crash-report/route.ts:8-33, src/app/api/orders/route.ts:48-207, src/app/api/payments/yookassa/route.ts:19-43, src/app/api/yggdrasil/authserver/signout/route.ts:7-21, src/app/api/yggdrasil/sessionserver/session/minecraft/profile/[uuid]/route.ts:10-18.
- Исправление: Redis/DB/WAF limiter, global и account buckets, body caps до parse, signed launcher upload, CAPTCHA/checkout nonce, provider quotas, retention и pagination.

### WEB-009 — Crypto pricing и invoice binding fail open

- Доказательство: src/lib/rates.ts:14-97 при outage использует статические TON=300/USDT=90 или бесконечно старый курс и обновляет fetchedAt как будто он свежий. src/lib/cryptobot.ts:46-80 не сохраняет invoice snapshot; webhook в src/app/api/payments/cryptobot/route.ts:38-66 не сверяет asset/amount/invoice с заказом.
- Воздействие: недоплата/переплата при волатильности или outage, невозможность надёжной reconciliation при provider anomaly.
- Исправление: bounded-staleness или fail-closed quote; хранить invoiceId, asset, amount, rate и source; повторно проверять invoice и точное соответствие перед claim.

### WEB-010 — Untrusted from после admin login может выполнить script-навигацию

- Доказательство: src/app/admin/login/page.tsx:33-35 передаёт query from напрямую в router.push после успешного password+TOTP.
- Сценарий: админ открывает подготовленный /admin/login?from=javascript:... или внешний/scheme-relative URL и после входа запускает код/переход в доверенном контексте. CSP содержит unsafe-inline.
- Исправление: принимать только нормализованный same-origin pathname, начинающийся с /admin; запрещать scheme, backslash и //; проще всегда отправлять на /admin.

## Medium

### WEB-011 — Public API и RSC раскрывают внутренние DTO

- src/app/api/products/route.ts:6-8 отдаёт RCON templates из product variants.
- src/app/api/orders/[publicId]/route.ts:5-13 и order/pay RSC возвращают internal id, paymentId, coupon, raw errors, fulfillmentCommands и rconCommands.
- UUID не перебирается тривиально, но расшаренная tracking-ссылка раскрывает покупки и внутреннюю консольную поверхность. Нужны отдельные PublicProductDTO/PublicOrderStatusDTO, Cache-Control private,no-store и noindex.

### WEB-012 — Admin session детерминирована и не отзывается

- src/lib/adminSession.ts:14-34 создаёт token только из expiry и HMAC; логины в одну секунду получают одинаковый token, server-side revocation отсутствует, TTL семь дней.
- Admin logout удаляет только cookie текущего браузера; src/app/api/admin/events/route.ts:8-88 проверяет auth один раз и продолжает SSE после logout/expiry.
- Нужны случайный session id, хранение его hash, revoke/rotation и периодическая проверка SSE.

### WEB-013 — Изменение 2FA не требует step-up и перезаписывает активный TOTP

- src/app/api/auth/2fa/totp/setup/route.ts:10-21 пишет новый secret прямо в totpSecretEnc; login сразу использует это поле.
- Переключение на email и admin reset-2fa не подтверждают текущий фактор; reset-2fa не bump tokenVersion и не удаляет app-password.
- Нужен pendingTotpSecretEnc с TTL, password+current factor, атомарная замена и полный revoke при recovery.

### WEB-014 — Одноразовые 2FA-коды допускают race/replay, JWT-типы смешаны

- Backup code читается и помечается двумя запросами: src/app/api/auth/login/2fa/route.ts:48-55. Email OTP тоже очищается после отдельной проверки.
- Challenge stateless, без jti/tokenVersion/consume. Он и session JWT подписаны одним JWT_SECRET; src/lib/auth.ts:18-22 не проверяет typ, purpose, aud, iss и превращает отсутствующий tv в 0.
- Нужны атомарный conditional consume, server-side challenge nonce и строгое разделение token types/keys.

### WEB-015 — Lockout и account discovery можно использовать против пользователя

- После десяти ошибок правильный пароль блокируется, а правильная попытка при lockout записывается как новая ошибка: src/app/api/auth/login/route.ts:38-48.
- Register/resend раскрывают существование email/username; lookup не canonicalize case последовательно; неизвестный account возвращается до dummy bcrypt.
- Нужны normalized identifiers, одинаковые ответы/timing, bounded password bytes, progressive backoff и reset failures после успеха.

### WEB-016 — GameToken и verification secrets хранятся открыто, лимитов нет

- prisma/schema.prisma:64-74 хранит accessToken/clientToken plaintext; verifyCode также plaintext.
- auth/game-session и Ygg authenticate могут бесконечно добавлять tokens; app-passwords не ограничены; profiles принимает неограниченный массив, profile UUID делает O(N) scan.
- Хранить HMAC/digest, ограничить TTL/count/array/body, ротировать token и сохранить индексируемый UUID.

### WEB-017 — SSH-мост не проверяет сервер и не ограничивает выполнение

- src/lib/mc-bridge.ts:30-46 не задаёт hostVerifier/known_hosts, общий deadline и output cap; stream может никогда не закрыться.
- Нужны pin fingerprint, constrained forced-command key, total timeout, max bytes и гарантированный cleanup при любом исходе.

### WEB-018 — Внешние платежные запросы не имеют deadline и строгой схемы

- CoinGecko, CryptoBot и YooKassa fetch не используют AbortSignal timeout и строгую runtime validation.
- YooMoney в src/app/api/payments/yoomoney/route.ts:65-71 использует parseFloat, не требует finite/canonical amount и ожидаемую currency/type.
- Нужны deadline, response size/schema, circuit breaker и строгая денежная модель в minor units.

### WEB-019 — Документированный YooMoney checkout не работает

- .env.example и DEPLOY.md предлагают PAYMENT_PROVIDER=yoomoney, но src/app/api/orders/route.ts:178-188 распознаёт только cryptobot, yookassa и multi.
- Client читает NEXT_PUBLIC_YOOMONEY_WALLET, а compose передаёт только YOOMONEY_WALLET. Результат — local mock URL и 404/застрявший заказ.
- Реализовать отдельный provider end-to-end либо удалить его из docs/UI; E2E для каждого поддерживаемого provider.

### WEB-020 — Три production-топологии и сломанный fresh VPS flow

- vps-setup.sh:29-68 включает TLS-конфиг до выпуска сертификата под set -e.
- DEPLOY.md получает сертификаты natuxworld.ru, nginx.conf жёстко использует vibestudy.ru; CI говорит о Vercel, docs — Docker/VPS/home Tailscale.
- Выбрать одну поддерживаемую topology, единый domain config и clean-VM smoke test с preflight secrets/certs.

### WEB-021 — Телеметрия replayable и может уйти по plaintext HTTP

- ApiSender.java:23-53 восстанавливает batch после ambiguous timeout; event IDs и uniqueness отсутствуют, поэтому commit-then-timeout дублирует события.
- URL конфигурируется без запрета remote HTTP, static API key отправляется как есть.
- Нужны event UUID, unique constraint/idempotency, HMAC timestamp+nonce+body и HTTPS, кроме явного loopback.

### WEB-022 — Runtime schemas отсутствуют на системных границах

- orders принимает username:number и падает на trim; crash-report с null падает при чтении kind; game-event с events:[null] падает до валидации.
- Доказательство: src/app/api/orders/route.ts:58-79,132-142; src/app/api/crash-report/route.ts:14-22; src/app/api/game-event/route.ts:32-50.
- Нужна общая Zod/Valibot-схема: object/non-null/type/length/enum/range и единый 400 без stack leak.

### WEB-023 — Privacy policy не соответствует сбору и публикации данных

- Политика не описывает бессрочные chat/command/coordinates и raw crash logs, хотя schema не имеет retention job.
- src/app/api/leaderboard/route.ts:14-37 публично выдаёт точные lifetime spending по Minecraft nick без opt-in.
- app/layout.tsx:37-43 загружает Google Fonts, хотя политика заявляет отсутствие передачи третьим сторонам.
- Нужны disclosure/lawful basis, opt-in/opt-out, minimization, export/delete, TTL cleanup и self-hosted fonts.

### WEB-024 — Catalog fallback и seed не транзакционны

- src/lib/productStore.ts:37-43 трактует пустую таблицу как unseeded и может воскресить static products после удаления последнего товара.
- Upsert и delete/create variants выполняются без общей транзакции; нет unique productId+duration.
- Нужны explicit seeded state, transaction и DB constraints.

### WEB-025 — Привилегированные действия продолжаются при потере audit

- src/lib/adminAudit.ts:11-30 подавляет ошибки БД; RCON/SSH выполняются до записи audit.
- При outage админские действия остаются только в stderr.
- Нужны durable pre-action intent и post-action result во внешнем append-only sink; критичные операции могут fail closed при недоступном audit.

### WEB-026 — Backup может оставить повреждённый файл как финальный

- scripts/backup-postgres.sh пишет gzip сразу в итоговый .sql.gz; interruption/disk-full оставляет partial archive. Offsite copy остаётся ручной.
- Нужны .tmp, gzip -t, checksum/fsync, atomic rename, encrypted automated offsite, monitoring и регулярный restore drill.

### WEB-027 — Supply-chain и production preflight неполны

- CI не запускает npm audit, secret/SAST/container scan; Docker/Compose используют mutable image tags; Paper зависит от mutable snapshot repository.
- scripts/check-secrets.mjs не включён в startup/CI и не проверяет provider, RCON, DB, SMTP, payment/SSH secrets и production mock.
- Prisma CLI и tooling dependencies попадают в runner. Нужны pinned digests/commits, dependency bot, audit gate, отдельный migrator и централизованная env schema.

### WEB-028 — Server status может утекать RCON connection и показывает противоречивое состояние

- src/app/api/server/status/route.ts закрывает RCON только на success path; connect/send exception обходит end.
- Header всегда показывает ONLINE, а homepage и ServerStatus делают отдельные one-shot requests; порт ping жёстко 25565.
- Нужны finally, configurable port и единый cached/polling status store с честным offline/stale состоянием.

## Low

### WEB-029 — Mock payment UI собирает PAN/CVV, хотя не использует их

- PaymentClient.tsx:337-361,553-610 хранит номер, expiry и CVV в React state, а POST отправляет только orderId.
- Это создаёт phishing/PCI surface без пользы. Оставить одну явную кнопку simulate payment с фиксированными test data.
- UI также неверно показывает free coupon как минимум 1 RUB и не всегда согласует выбранный method с provider.

### WEB-030 — 3D-декор дорогой и не полностью уважает reduced motion

- Podium загружает около 933 KB uncompressed JS; matrix updates продолжаются каждый animation frame, часть объектов работает даже при reduced-motion.
- Формы и selectors также не имеют полного label/aria/radiogroup/live-region набора.
- Нужны lazy-on-visible, demand frameloop/CSS fallback, Save-Data/reduced-motion и semantic form controls.

### WEB-031 — Интерфейс заявляет live data, но показывает static/demo

- LeaderboardClient содержит hardcoded игроков; /map показывает placeholder, хотя header пишет 3D MAP LIVE; server status часто не обновляется.
- Либо подключить реальные источники с loading/error/stale, либо явно и заметно пометить demo/unavailable.

### WEB-032 — CSP допускает inline scripts

- next.config.mjs:10-27 содержит script-src self unsafe-inline.
- Текущий scan не нашёл dangerouslySetInnerHTML, innerHTML, eval или new Function, поэтому прямой source-to-sink XSS не подтверждён.
- Перейти на nonce/hash CSP и сохранить существующие HSTS, frame-ancestors, nosniff и referrer policy.

### WEB-033 — В репозитории раскрыты инфраструктурные и персональные детали

- vps-setup.sh:6-8 содержит Tailscale IP и личный email; middleware.ts:5-11 — production admin allowlist IP.
- Вынести в env/placeholders и сменить значения, если они считались приватными.

### WEB-034 — Крупные компоненты и тестовые пробелы увеличивают риск регрессий

- src/app/admin/page.tsx — 1317 строк; src/app/page.tsx — 853; ShopClient.tsx — 762; PaymentClient.tsx — 664.
- Нет adversarial tests для provider missing/unknown, verified resend-code, public DTO, coupon concurrency, crash/game-event malformed bodies, rate outage, recovery after process crash, frontend/a11y и Java plugin.
- Разделить файлы по ответственности и добавить route, fault-injection, concurrency и E2E tests.

## Положительные контроли

- Цена, product, variant и coupon пересчитываются на сервере; клиентская цена не принимается.
- YooKassa webhook используется только как сигнал: payment повторно читается через authenticated API и сверяется по RUB amount/currency.
- CryptoBot raw-body HMAC и YooMoney signature сравниваются constant-time.
- Claim заказа использует atomic status CAS, paymentId уникален.
- Coupon SQL параметризован; явной SQL/command injection из public input не найдено.
- Username/duration и admin RCON actions ограничены allowlists/policy.
- User JWT проверяет tokenVersion, verification и banned state; GameToken имеет TTL.
- TOTP secret защищён AES-256-GCM, backup/app passwords хешируются.
- Admin требует password+TOTP; cookie HttpOnly, Secure в production и SameSite=Strict.
- nginx перезаписывает X-Forwarded-For/X-Real-IP; app и PostgreSQL не публикуются наружу через compose.
- Container запускает приложение не от root; EventBuffer имеет memory bound.
- Реальных credentials в tracked files и git history не обнаружено.

## Очерёдность исправлений

### P0 — до любого production запуска

1. Закрыть WEB-001: fail-closed provider, убрать mock route/UI из production, добавить startup env validation.
2. Закрыть WEB-002 и WEB-003, отозвать существующие app-passwords/sessions и проверить журналы.
3. Обновить Next.js и заблокировать ненужные WebSocket Upgrade.
4. Остановить raw command/chat telemetry и удалить уже собранные секреты по retention-процедуре.

### P1 — до приёма реальных платежей

1. Сделать coupon reservation и fulfillment идемпотентными.
2. Исправить crypto quote/invoice binding, provider timeouts и YooMoney contract.
3. Ввести distributed limiter, body caps, signed crash upload, checkout quotas и cleanup.
4. Сократить public DTO и закрыть точные spending/operational fields.

### P2 — hardening и эксплуатация

1. Перестроить 2FA challenge/session lifecycle и admin sessions.
2. Хешировать GameToken, ограничить Ygg arrays/tokens и убрать O(N) lookup.
3. Закрепить SSH host key, добавить deadlines/output caps.
4. Унифицировать deployment, backups, audit, CI scans, retention и privacy policy.
5. Закрыть frontend integrity, accessibility, performance и тестовые пробелы.

## Критерий готовности после исправлений

- Production не стартует при missing/unknown/mock payment configuration.
- Ни один public request не способен вызвать real RCON без подтверждённой оплаты.
- Email enrollment не авторизует уже verified account.
- Password/2FA recovery отзывает JWT, GameToken и app-password.
- Повтор webhook/restart/timeout даёт ровно одну эффективную привилегию.
- maxUses=1 выдерживает параллельные checkout/payment.
- Public DTO не содержит commands, paymentId, raw errors или exact spending.
- Multi-instance rate-limit и body caps проверены нагрузочными тестами.
- npm audit production не содержит применимых High/Critical; Java build и security scans проходят в CI.

## Ограничение гарантии

Отчёт фиксирует подтверждённые и обоснованные риски в указанной ревизии, но не доказывает отсутствие других уязвимостей. После исправлений нужен повторный diff-review и тестирование в staging с реальными proxy/provider/RCON границами.
