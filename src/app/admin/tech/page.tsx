// Техническая документация NATUX WORLD — простым языком.
// Страница под /admin, поэтому закрыта middleware (IP-allowlist + сессия админа).
// Это статический справочник «что и как работает»: лаунчер, сайт, бэкенд.

type Section = { id: string; title: string; body: React.ReactNode }

function Card({ s }: { s: Section }) {
  return (
    <section id={s.id} className="scroll-mt-20 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
      <h2 className="mb-3 text-lg font-bold text-red-400">{s.title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-neutral-200">{s.body}</div>
    </section>
  )
}

function Q({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-100">{children}</code>
}

const SECTIONS: Section[] = [
  {
    id: 'map',
    title: 'Карта системы — 3 части',
    body: (
      <>
        <p>Проект состоит из трёх независимых кусков, которые общаются по сети:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Лаунчер</b> — программа на компьютере игрока (Electron). Качает и запускает Minecraft, логинит в аккаунт.</li>
          <li><b>Сайт</b> — то, что открывается в браузере на <Q>vibestudy.ru</Q> (магазин, кабинет, рейтинг). Сделан на Next.js.</li>
          <li><b>Бэкенд (API)</b> — «мозг» на сервере: проверяет пароли, хранит данные в базе, выдаёт привилегии, обрабатывает оплату. Живёт в том же Next.js-проекте что и сайт.</li>
        </ul>
        <p>Отдельно: <b>игровой сервер Minecraft</b> (<Q>mc.vibestudy.ru</Q>) и <b>плагин</b> на нём, который шлёт события игроков в бэкенд.</p>
        <p className="text-neutral-400">Связь: лаунчер и игра ↔ бэкенд (через интернет). Сайт ↔ бэкенд. Бэкенд ↔ база данных (Postgres) и игровой сервер (по RCON).</p>
      </>
    ),
  },
  {
    id: 'launcher',
    title: 'Лаунчер (NatuxWorld, Electron)',
    body: (
      <>
        <p>Отдельная программа (репозиторий <Q>NatuxWorld</Q>). Что делает по шагам:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Вход в аккаунт.</b> Игрок вводит логин/пароль → лаунчер шлёт их на бэкенд (<Q>/api/auth/login</Q>) → получает токен сессии (JWT) и запоминает.</li>
          <li><b>Кнопка «Играть».</b> Лаунчер просит у бэкенда игровой токен (<Q>/api/auth/game-session</Q>), скачивает нужную версию Minecraft + Forge + библиотеки (если их ещё нет).</li>
          <li><b>authlib-injector.</b> Скачивает специальную «прослойку» (<Q>authlib-injector.jar</Q>) и запускает игру с ней. Прослойка заставляет Minecraft проверять вход не у Mojang, а у нашего сервера (<Q>/api/yggdrasil</Q>).</li>
          <li><b>Запуск игры.</b> Стартует Java с нужными параметрами и игровым токеном. Игра подключается к <Q>mc.vibestudy.ru</Q>.</li>
          <li><b>Авто-обновление.</b> Новые версии лаунчера собираются автоматически (GitHub Actions) под Windows и macOS и кладутся в Releases; лаунчер сам предлагает обновиться.</li>
        </ol>
        <p className="text-neutral-400">Важно: лаунчер сам по себе «тонкий» — вся проверка логина/прав на бэкенде. Если у игрока включена 2FA, он вводит в поле пароля не основной пароль, а «app-пароль» (см. раздел Безопасность).</p>
      </>
    ),
  },
  {
    id: 'site',
    title: 'Сайт (Next.js, браузер)',
    body: (
      <>
        <p>Открывается на <Q>vibestudy.ru</Q>. Основные страницы:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Магазин</b> — привилегии/ранги. Выбор товара, промокод, оплата.</li>
          <li><b>Кабинет</b> — данные аккаунта, безопасность (<Q>/account/security</Q> — включение 2FA, app-пароли).</li>
          <li><b>Рейтинг (лидерборд)</b> — топ игроков, 3D-подиум.</li>
          <li><b>Главная / правила / FAQ</b> — маркетинг, 3D-эффекты.</li>
          <li><b>Админка</b> (<Q>/admin</Q>) — закрыта, см. раздел Админка.</li>
        </ul>
        <p>Сайт нарисован на React (Next.js App Router) + Tailwind для стилей + Three.js для 3D-моделей. Большинство страниц «статические» — заранее собраны, поэтому быстрые.</p>
      </>
    ),
  },
  {
    id: 'backend',
    title: 'Бэкенд / API — что происходит на сервере',
    body: (
      <>
        <p><b>Аккаунты и вход:</b></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Регистрация → ник + email + пароль. Пароль хранится в виде хеша (bcrypt), не в открытом виде.</li>
          <li>Email подтверждается кодом (письмо через SMTP).</li>
          <li>Вход выдаёт токен JWT на 30 дней. У токена есть «версия» (<Q>tokenVersion</Q>): если её увеличить в базе — все старые токены сразу умирают (так работает «выйти со всех устройств», бан, смена 2FA).</li>
        </ul>
        <p><b>Игровой вход (yggdrasil):</b> наш сервер прикидывается «сервером авторизации Minecraft». Игра при подключении делает <Q>authenticate</Q> → <Q>join</Q>, игровой сервер проверяет <Q>hasJoined</Q>. Профили/скины подписываются RSA-ключом (его публичную часть лаунчер проверяет).</p>
        <p><b>Магазин и оплата:</b> заказ создаётся (<Q>/api/orders</Q>), оплата идёт через ЮKassa / ЮMoney / CryptoBot. Когда платёж подтверждён (webhook от платёжки) — заказ помечается оплаченным и привилегия выдаётся на игровом сервере командой по <b>RCON</b> (удалённая консоль). Промокоды — модель <Q>Coupon</Q>.</p>
        <p><b>Плагин на сервере:</b> Java-плагин (<Q>natux-plugin</Q>) ловит события (вход, смерть, чат и т.п.) и батчами шлёт их в <Q>/api/game-event</Q> с секретным ключом <Q>GAME_API_KEY</Q>. Бэкенд складывает в таблицу <Q>GameEvent</Q> — это лента активности в админке.</p>
        <p><b>Отчёты о крашах:</b> лаунчер при падении шлёт лог в <Q>/api/crash-report</Q> — видно в админке.</p>
      </>
    ),
  },
  {
    id: 'db',
    title: 'База данных (Postgres + Prisma)',
    body: (
      <>
        <p>Все данные в Postgres. Доступ через Prisma (типобезопасный слой). Основные таблицы:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><Q>User</Q> — аккаунты (ник, email, хеш пароля, бан, 2FA-поля, tokenVersion).</li>
          <li><Q>AppPassword</Q> / <Q>TwoFactorBackupCode</Q> — игровые app-пароли и резервные коды 2FA (хранятся хешами).</li>
          <li><Q>GameToken</Q> — игровые токены сессий Minecraft.</li>
          <li><Q>LoginEvent</Q> — журнал входов/ошибок (используется для блокировки при брутфорсе).</li>
          <li><Q>Order</Q> / <Q>Coupon</Q> — заказы магазина и промокоды.</li>
          <li><Q>GameEvent</Q> — события из игры (от плагина). <Q>CrashReport</Q> — краши лаунчера.</li>
        </ul>
        <p className="text-neutral-400">Изменения схемы applied миграциями (<Q>prisma migrate</Q>) — их обязательно прогоняют на сервере ДО запуска нового кода.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Безопасность',
    body: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Пароли</b> — только хеши (bcrypt). В базе пароля в открытом виде нет.</li>
          <li><b>Защита от перебора</b> — лимит попыток по IP (rate-limit) + блокировка аккаунта после серии неудач (lockout, считается по <Q>LoginEvent</Q>).</li>
          <li><b>Отзыв токенов</b> — через <Q>tokenVersion</Q> (см. Бэкенд). Бан игрока тоже увеличивает версию → его выкидывает.</li>
          <li><b>2FA (двухфакторка)</b> — по желанию: приложение-аутентификатор (TOTP) или код на email. Резервные коды на случай потери телефона. Для игры — отдельный «app-пароль» (основной пароль в игру не пускает, если включена 2FA). Секреты TOTP в базе зашифрованы (AES-256-GCM).</li>
          <li><b>Заголовки</b> — HSTS (только https), CSP (ограничение скриптов), запрет встраивания в iframe.</li>
          <li><b>Секреты</b> (<Q>JWT_SECRET</Q>, <Q>ADMIN_PASSWORD</Q>, ключи оплаты и т.д.) — только в переменных окружения сервера, не в коде. Скрипт <Q>check-secrets</Q> не даёт задеплоить с дефолтными значениями.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin',
    title: 'Админка',
    body: (
      <>
        <p>Доступ к <Q>/admin</Q> и <Q>/api/admin</Q> закрыт тремя слоями (middleware):</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Белый список IP</b> — с чужого IP страница отвечает 404 (как будто её нет).</li>
          <li><b>Сессия админа</b> — подписанная кука после входа.</li>
          <li><b>2FA (TOTP)</b> — вход в админку требует код из приложения-аутентификатора.</li>
        </ol>
        <p>Что умеет панель: пользователи (бан, выдача рангов, сброс сессий, верификация), заказы, промокоды, лента событий из игры, отчёты о крашах, выполнение RCON-команд (с защитой от опасных команд).</p>
      </>
    ),
  },
  {
    id: 'infra',
    title: 'Инфраструктура и деплой',
    body: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Сервер:</b> приложение Next.js собирается в режиме <Q>standalone</Q> и крутится под <Q>pm2</Q>. Перед ним стоит <b>nginx</b> (https, проксирование, раздача статики, передача реального IP).</li>
          <li><b>База:</b> Postgres. Миграции Prisma применяются при каждом обновлении ДО рестарта.</li>
          <li><b>Деплой сайта/бэка:</b> обновить код → <Q>npm ci</Q> → <Q>prisma migrate deploy</Q> → <Q>npm run build</Q> → <Q>pm2 reload</Q>.</li>
          <li><b>Деплой лаунчера:</b> отдельный репозиторий; при подъёме версии в <Q>package.json</Q> GitHub Actions автоматически собирает установщики Windows + macOS и публикует в Releases.</li>
          <li><b>Важно про статику:</b> в standalone нужно копировать <Q>.next/static</Q> и <Q>public</Q> рядом с сервером, иначе сайт грузится без стилей.</li>
        </ul>
      </>
    ),
  },
]

export default function AdminTechPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 text-neutral-100">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Техническая документация</h1>
        <p className="text-sm text-neutral-400">Как устроен NATUX WORLD простым языком: лаунчер, сайт, бэкенд. Для своих, внутреннее.</p>
        <nav className="flex flex-wrap gap-2 pt-2 text-xs">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded bg-neutral-800 px-2 py-1 text-neutral-300 hover:bg-neutral-700">
              {s.title}
            </a>
          ))}
        </nav>
      </header>
      {SECTIONS.map((s) => <Card key={s.id} s={s} />)}
      <footer className="pt-4 text-xs text-neutral-500">
        Документ описывает архитектуру на момент написания. При крупных изменениях — обновлять здесь.
      </footer>
    </main>
  )
}
