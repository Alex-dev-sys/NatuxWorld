import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Новости',
  description: 'Новости и обновления сервера NATUX WORLD.',
}

type Tag = 'ОБНОВЛЕНИЕ' | 'ИВЕНТ' | 'ФИКС' | 'АНОНС'

const TAG_COLOR: Record<Tag, string> = {
  'ОБНОВЛЕНИЕ': '#FF2B4F',
  'ИВЕНТ': '#F0A500',
  'ФИКС': '#22C55E',
  'АНОНС': '#4A7FBB',
}

const NEWS = [
  {
    date: '28 МАЯ 2025',
    tag: 'ОБНОВЛЕНИЕ' as Tag,
    title: 'СЕЗОН 3: НОВЫЕ ЗЕМЛИ',
    desc: 'Открылся третий сезон NATUX WORLD. Полный вайп мира, 5 новых рангов с уникальными способностями, обновлённая спавн-зона и переработанная система PvP-рейтинга. Добро пожаловать в новую эру.',
    details: ['Полный вайп мира', '5 новых рангов: Phantom, King, God +2', 'Новая система рейтинга PvP', 'Переработанный спавн'],
  },
  {
    date: '20 МАЯ 2025',
    tag: 'ИВЕНТ' as Tag,
    title: 'ТУРНИР ПОСЛЕДНЕГО ВЫЖИВШЕГО',
    desc: '72-часовой ивент "Последний выживший". 128 участников, один победитель. Призовой фонд — ранг GOD на год + 5000 рублей на счёт. Регистрация закрыта, следите за результатами.',
    details: ['128 участников', 'Приз: ранг GOD на год', 'Дополнительно: 5000₽', 'Итоги 23 мая'],
  },
  {
    date: '14 МАЯ 2025',
    tag: 'ФИКС' as Tag,
    title: 'ПАТЧ 2.4.1 — СТАБИЛИЗАЦИЯ',
    desc: 'Исправлены критические ошибки: дюп предметов через энодер, баг с телепортацией на кровати, утечка памяти на чанках 2000+ от спавна. Сервер стал работать на 30% стабильнее.',
    details: ['Исправлен дюп через эндер', 'Фикс TP на кровати', 'Утечка памяти устранена', 'TPS: 18 → 19.8'],
  },
  {
    date: '5 МАЯ 2025',
    tag: 'АНОНС' as Tag,
    title: 'ИНТЕГРАЦИЯ С DISCORD',
    desc: 'Скоро: полная интеграция сервера с Discord-ботом. Уведомления об убийствах, онлайн-статус, верификация аккаунта прямо из дискорда. Бета-тест для донаторов уже на следующей неделе.',
    details: ['Kill-уведомления в Discord', 'Верификация аккаунта', 'Бета для ранга Baron+', 'Релиз: июнь 2025'],
  },
  {
    date: '28 АПРЕЛЯ 2025',
    tag: 'ОБНОВЛЕНИЕ' as Tag,
    title: 'МАГАЗИН 2.0 — НОВЫЙ ИНТЕРФЕЙС',
    desc: 'Полностью переработан сайт и магазин привилегий. Новый дизайн в стиле WAR OPS, анимированный карусель рангов, страница оплаты с 3D-картой. Промокоды теперь копируются одним кликом.',
    details: ['Новый дизайн сайта', 'Анимированный карусель', 'Платёжная страница с флипом карты', 'Промокод по клику'],
  },
]

export default function NewsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">

      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 28, backgroundColor: '#FF2B4F', borderRadius: 2, flexShrink: 0 }} />
          <h1
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(36px, 8vw, 64px)',
              letterSpacing: '0.08em',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            ОПЕРАТИВНЫЕ НОВОСТИ
          </h1>
        </div>
        <p style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
          color: '#444', letterSpacing: '0.4em', textTransform: 'uppercase', marginLeft: 15,
        }}>
          ПОСЛЕДНИЕ СОБЫТИЯ НА СЕРВЕРЕ
        </p>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 1,
          background: 'linear-gradient(to bottom, #FF2B4F, #3A1017 60%, transparent)',
        }} />

        <div style={{ paddingLeft: 28, display: 'flex', flexDirection: 'column', gap: 40 }}>
          {NEWS.map((item, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -33, top: 6,
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: TAG_COLOR[item.tag],
                boxShadow: `0 0 10px ${TAG_COLOR[item.tag]}80`,
                border: '2px solid #070707',
              }} />

              {/* Card */}
              <div
                className="hover:border-white/10 transition-colors duration-200"
                style={{
                  backgroundColor: '#0e0e0e',
                  border: '1px solid #3A1017',
                  borderRadius: 12,
                  padding: '20px 24px',
                  clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                }}
              >
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                    color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase',
                  }}>{item.date}</span>
                  <span style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 8,
                    fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                    backgroundColor: TAG_COLOR[item.tag] + '20',
                    color: TAG_COLOR[item.tag],
                    border: `1px solid ${TAG_COLOR[item.tag]}50`,
                    padding: '2px 8px', borderRadius: 20,
                  }}>{item.tag}</span>
                </div>

                {/* Title */}
                <h2 style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: 24, letterSpacing: '0.06em',
                  color: '#fff', marginBottom: 8,
                }}>{item.title}</h2>

                {/* Description */}
                <p style={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                  color: '#888', lineHeight: 1.7, marginBottom: 14,
                }}>{item.desc}</p>

                {/* Detail bullets */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {item.details.map(d => (
                    <span
                      key={d}
                      style={{
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                        color: '#666', backgroundColor: '#1a1a1a',
                        border: '1px solid #2a2a2a', padding: '3px 10px', borderRadius: 4,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 48, textAlign: 'center' }}>
        <p style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
          color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 16,
        }}>
          СЛЕДИ ЗА НОВОСТЯМИ В СОЦСЕТЯХ
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/shop"
            className="bg-[#FF2B4F] hover:bg-[#cc1a35] transition-colors duration-200"
            style={{
              fontFamily: '"Bebas Neue", sans-serif', fontSize: 15,
              letterSpacing: '0.2em', color: '#fff', padding: '10px 28px',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
              textDecoration: 'none',
            }}
          >
            В МАГАЗИН
          </Link>
          <a
            href="https://vk.com/natuxworld"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-[#3A1017] text-[#888] hover:border-site-accent hover:text-site-accent transition-colors duration-200"
            style={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
              letterSpacing: '0.2em', textTransform: 'uppercase', padding: '10px 24px',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
              textDecoration: 'none',
            }}
          >
            VK ГРУППА →
          </a>
        </div>
      </div>
    </div>
  )
}
