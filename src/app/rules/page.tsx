export const metadata = {
  title: 'Правила — NATUX WORLD',
}

const sections = [
  {
    title: '1. Общие правила',
    rules: [
      'Уважай других игроков — оскорбления в адрес rl-личности запрещены.',
      'Читы, взломанные клиенты и эксплойты движка — бан.',
      'Дюпы блоков (кроме TNT) запрещены.',
      'Реклама других серверов — бан.',
      'Обход блокировки (смена аккаунта) — бан до 30 дней.',
    ],
  },
  {
    title: '2. Правила чата',
    rules: [
      'Флуд и спам — мут до 24 часов.',
      'Реклама сторонних ресурсов — мут или бан.',
      'Угрозы DDoS и доксинг — перманентный бан.',
      'Капслок и повторяющиеся сообщения — мут до 1 часа.',
    ],
  },
  {
    title: '3. Правила PvP',
    rules: [
      'PvP разрешён везде вне точки спавна.',
      'Трапы на спавне запрещены.',
      'Читы для PvP (KillAura, AutoClicker и т.д.) — перманентный бан.',
      'Затрапить игрока можно в любом месте мира, кроме спавна.',
    ],
  },
  {
    title: '4. Правила доната',
    rules: [
      'Донат не даёт преимущества в бою — только косметику и удобство.',
      'Донат не возвращается в случае бана за нарушение правил.',
      'Привилегии действуют строго в рамках срока действия.',
      'Передача доната другому игроку невозможна.',
    ],
  },
  {
    title: '5. Возвраты',
    rules: [
      'Возврат средств возможен только при технической ошибке выдачи.',
      'Возврат за "не понравилось" не осуществляется.',
      'Для возврата обратитесь в поддержку с номером заказа.',
      'Срок рассмотрения обращения — до 5 рабочих дней.',
    ],
  },
  {
    title: '6. Наказания',
    rules: [
      'Предупреждение → мут → кик → временный бан → перманентный бан.',
      'Тяжёлые нарушения (читы, реклама) — перманентный бан без предупреждения.',
      'Обжаловать бан можно в VK или Discord.',
      'Администрация оставляет право на своё усмотрение в спорных ситуациях.',
    ],
  },
]

export default function RulesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-pixel text-sm md:text-base text-site-accent mb-2 text-center">
        ПРАВИЛА СЕРВЕРА
      </h1>
      <p className="text-site-muted text-sm text-center mb-10">
        Незнание правил не освобождает от ответственности
      </p>

      <div className="space-y-6">
        {sections.map(section => (
          <div
            key={section.title}
            className="bg-site-block border border-site-border rounded-lg p-6 hover:border-site-border/80 transition-colors"
          >
            <h2 className="text-site-accent font-semibold mb-4">{section.title}</h2>
            <ul className="space-y-2">
              {section.rules.map(rule => (
                <li key={rule} className="flex items-start gap-3 text-sm text-site-muted leading-relaxed">
                  <span className="text-site-accent mt-0.5 flex-shrink-0">›</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-site-secondary border border-site-dark-red/50 rounded-lg">
        <p className="text-site-muted text-sm text-center">
          По вопросам обращайтесь в{' '}
          <a href="https://vk.com/natuxworld" target="_blank" rel="noopener noreferrer" className="text-site-accent hover:underline">
            VK
          </a>
        </p>
      </div>
    </div>
  )
}
