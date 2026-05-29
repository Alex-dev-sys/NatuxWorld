import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Правила',
  description: 'Правила сервера NATUX WORLD. Кодекс операции — уровень доступа ALPHA.',
}

type RuleItem = { text: string; type: 'ban' | 'ok' | 'warn' | 'neutral' }

const SECTIONS = [
  {
    code: 'SEC-01',
    title: 'ОБЩИЕ ПРАВИЛА',
    tag: 'ОБЯЗАТЕЛЬНО',
    tagColor: '#FF2B4F',
    rules: [
      { text: 'Уважай других игроков — оскорбления rl-личности запрещены', type: 'ban' },
      { text: 'Читы, взломанные клиенты и эксплойты движка — перманентный бан', type: 'ban' },
      { text: 'Дюпы блоков (кроме TNT) запрещены', type: 'ban' },
      { text: 'Реклама других серверов — мгновенный бан', type: 'ban' },
      { text: 'Обход блокировки — бан до 30 дней', type: 'ban' },
      { text: 'Строительство, рейды, ловушки — разрешено везде', type: 'ok' },
    ] as RuleItem[],
  },
  {
    code: 'SEC-02',
    title: 'PVP ПРОТОКОЛ',
    tag: 'БОЕВОЙ РЕЖИМ',
    tagColor: '#F0A500',
    rules: [
      { text: 'PvP разрешён везде вне радиуса 50 блоков от спавна', type: 'ok' },
      { text: 'Ловушки и засады в любом месте мира — разрешено', type: 'ok' },
      { text: 'Трапы непосредственно на спавне — запрещены', type: 'ban' },
      { text: 'KillAura, AutoClicker, Reach-читы — перманентный бан', type: 'ban' },
      { text: 'Грифинг вне зоны спавна — разрешён', type: 'ok' },
    ] as RuleItem[],
  },
  {
    code: 'SEC-03',
    title: 'ЧАТ И СВЯЗЬ',
    tag: 'КОММУНИКАЦИЯ',
    tagColor: '#4A7FBB',
    rules: [
      { text: 'Флуд и спам — мут до 24 часов', type: 'warn' },
      { text: 'Реклама сторонних ресурсов — мут или бан', type: 'ban' },
      { text: 'Угрозы DDoS и доксинг — перманентный бан', type: 'ban' },
      { text: 'Капслок и повторяющиеся сообщения — мут до 1 часа', type: 'warn' },
      { text: 'Общение на любом языке — разрешено', type: 'ok' },
    ] as RuleItem[],
  },
  {
    code: 'SEC-04',
    title: 'ДОНАТ И ПРИВИЛЕГИИ',
    tag: 'ФИНАНСЫ',
    tagColor: '#50C878',
    rules: [
      { text: 'Донат не даёт боевых преимуществ — только косметика и удобство', type: 'ok' },
      { text: 'Привилегии действуют строго в рамках срока', type: 'neutral' },
      { text: 'Передача привилегии другому игроку невозможна', type: 'neutral' },
      { text: 'Донат не возвращается при бане за нарушение правил', type: 'ban' },
      { text: 'Стек привилегий (несколько рангов) — не работает', type: 'neutral' },
    ] as RuleItem[],
  },
  {
    code: 'SEC-05',
    title: 'АДМИНИСТРАЦИЯ',
    tag: 'КОМАНДОВАНИЕ',
    tagColor: '#9B59B6',
    rules: [
      { text: 'Решения администраторов обязательны к исполнению', type: 'neutral' },
      { text: 'Обжаловать бан можно в VK или Discord', type: 'ok' },
      { text: 'Срок рассмотрения апелляции — до 5 рабочих дней', type: 'neutral' },
      { text: 'Администрация не несёт ответственности за потерю предметов', type: 'warn' },
      { text: 'Выдача предметов через /give по запросам игроков — запрещена', type: 'ban' },
    ] as RuleItem[],
  },
]

const TYPE_ICON: Record<RuleItem['type'], string> = {
  ban: '✗',
  ok: '✓',
  warn: '⚠',
  neutral: '›',
}
const TYPE_COLOR: Record<RuleItem['type'], string> = {
  ban: '#FF2B4F',
  ok: '#22c55e',
  warn: '#F0A500',
  neutral: '#555',
}

export default function RulesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">

      {/* Classified header */}
      <div
        style={{
          backgroundColor: '#0a0000', border: '1px solid #FF2B4F30',
          borderRadius: 8, padding: '12px 20px', marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#FF2B4F', boxShadow: '0 0 8px #FF2B4F' }} />
          <span style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
            color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase',
          }}>ДОКУМЕНТ ЗАСЕКРЕЧЕН — УРОВЕНЬ ДОСТУПА: ALPHA</span>
        </div>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#3A1017', letterSpacing: '0.3em',
        }}>REV.2025.05 // NATUX-OPS</span>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 36 }}>
        <h1
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(40px, 9vw, 72px)',
            letterSpacing: '0.08em', lineHeight: 1, color: '#fff',
            marginBottom: 4,
          }}
        >
          КОДЕКС ОПЕРАЦИИ
        </h1>
        <p style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
          color: '#444', letterSpacing: '0.5em', textTransform: 'uppercase',
        }}>
          НЕЗНАНИЕ ПРАВИЛ НЕ ОСВОБОЖДАЕТ ОТ ОТВЕТСТВЕННОСТИ
        </p>
      </div>

      {/* Rule legend */}
      <div style={{
        display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 28,
        padding: '10px 16px',
        backgroundColor: '#0e0e0e', border: '1px solid #3A1017', borderRadius: 8,
      }}>
        {(['ok', 'ban', 'warn', 'neutral'] as RuleItem['type'][]).map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: TYPE_COLOR[t], fontSize: 13, fontWeight: 700 }}>{TYPE_ICON[t]}</span>
            <span style={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
              color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>
              {t === 'ok' ? 'Разрешено' : t === 'ban' ? 'Запрещено' : t === 'warn' ? 'Предупреждение' : 'Нейтрально'}
            </span>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SECTIONS.map(section => (
          <div
            key={section.code}
            style={{
              backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
              borderRadius: 12, overflow: 'hidden',
              clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
            }}
          >
            {/* Section header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid #1a0808',
              backgroundColor: '#0a0000', flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                  color: '#3A1017', letterSpacing: '0.3em',
                }}>{section.code}</span>
                <div style={{ width: 1, height: 14, backgroundColor: '#3A1017' }} />
                <h2 style={{
                  fontFamily: '"Bebas Neue", sans-serif', fontSize: 20,
                  letterSpacing: '0.08em', color: '#fff', margin: 0,
                }}>{section.title}</h2>
              </div>
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 8,
                letterSpacing: '0.2em', textTransform: 'uppercase',
                backgroundColor: section.tagColor + '18',
                color: section.tagColor,
                border: `1px solid ${section.tagColor}40`,
                padding: '3px 10px', borderRadius: 20,
              }}>{section.tag}</span>
            </div>

            {/* Rules list */}
            <ul style={{ listStyle: 'none', margin: 0, padding: '12px 0' }}>
              {section.rules.map((rule, i) => (
                <li
                  key={i}
                  className="hover:bg-[#1a0808] transition-colors duration-150"
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 20px',
                    borderBottom: i < section.rules.length - 1 ? '1px solid #0f0608' : 'none',
                  }}
                >
                  <span style={{
                    color: TYPE_COLOR[rule.type], fontSize: 13, fontWeight: 700,
                    flexShrink: 0, lineHeight: '18px', width: 16, textAlign: 'center',
                  }}>{TYPE_ICON[rule.type]}</span>
                  <span style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                    color: '#999', lineHeight: 1.6,
                  }}>{rule.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Punishments scale */}
      <div style={{
        marginTop: 24, backgroundColor: '#0a0000',
        border: '1px solid #3A1017', borderRadius: 10, padding: '18px 22px',
      }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 14,
        }}>
          ШКАЛА НАКАЗАНИЙ
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
          {[
            { label: 'ПРЕДУПРЕЖДЕНИЕ', color: '#666' },
            { label: 'МУТ', color: '#888' },
            { label: 'КИК', color: '#F0A500' },
            { label: 'ВРЕМ. БАН', color: '#FF6B35' },
            { label: 'ПЕРМ. БАН', color: '#FF2B4F' },
          ].map((step, i, arr) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                backgroundColor: step.color + '20', border: `1px solid ${step.color}50`,
                padding: '5px 12px', borderRadius: 4,
                fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                color: step.color, letterSpacing: '0.15em', textTransform: 'uppercase',
              }}>{step.label}</div>
              {i < arr.length - 1 && (
                <div style={{ color: '#3A1017', fontSize: 12, padding: '0 4px' }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div style={{
        marginTop: 16, textAlign: 'center', padding: '16px',
        borderTop: '1px solid #3A1017',
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
          color: '#444', letterSpacing: '0.2em',
        }}>
          Обжаловать бан:{' '}
          <a href="https://vk.com/natuxworld" target="_blank" rel="noopener noreferrer"
            style={{ color: '#FF2B4F', textDecoration: 'none' }}>VK</a>
          {' · '}
          <a href="https://discord.gg/natuxworld" target="_blank" rel="noopener noreferrer"
            style={{ color: '#5865F2', textDecoration: 'none' }}>Discord</a>
        </span>
      </div>
    </div>
  )
}
