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
    date: '1 ИЮНЯ 2026',
    tag: 'ИВЕНТ' as Tag,
    title: 'ЛЕТНИЙ ИВЕНТ «ЖАРА»',
    desc: 'Стартует летний ивент NATUX WORLD! Месяц горячих заданий, тематический летний мир с пляжами и тропиками, эксклюзивные косметические награды и удвоенный дроп на выходных. Участвуй и забирай уникальные летние титулы.',
    details: ['x2 дроп по выходным', 'Тематический летний мир', 'Эксклюзивные летние титулы', 'Промокод LAUNCH: −15%'],
  },
  {
    date: '24 МАЯ 2026',
    tag: 'ФИКС' as Tag,
    title: 'ОБНОВЛЕНИЕ АНТИЧИТА',
    desc: 'Развернули новую версию серверного анти-чита. Усилено обнаружение fly/speed/killaura, добавлена серверная проверка отбойного урона и автоматический бан читеров по поведенческим паттернам. Играй честно — система стала умнее.',
    details: ['Детект fly / speed / killaura', 'Серверная проверка урона', 'Авто-бан по паттернам', 'Меньше ложных срабатываний'],
  },
  {
    date: '15 МАЯ 2026',
    tag: 'ОБНОВЛЕНИЕ' as Tag,
    title: 'НОВЫЕ РАНГИ: KNIGHT И WARLORD',
    desc: 'В магазин добавлены два новых ранга — Knight и Warlord. Расширенные наборы команд, увеличенные лимиты приватов, доступ к закрытым PvP-аренам и уникальные префиксы в чате. Оплата картой или криптой (TON / USDT).',
    details: ['Ранг Knight', 'Ранг Warlord', 'Закрытые PvP-арены', 'Оплата TON / USDT'],
  },
  {
    date: '1 МАЯ 2026',
    tag: 'АНОНС' as Tag,
    title: 'NATUX WORLD ОТКРЫТ!',
    desc: 'Официальный запуск сервера NATUX WORLD! Свежий мир, дружное комьюнити, продуманный баланс выживания и PvP. Заходи на mc.vibestudy.ru, выбирай ранг и стань частью нового мира с первого дня. Для первых игроков — приветственная скидка.',
    details: ['Свежий старт мира', 'IP: mc.vibestudy.ru', 'Версия 1.20.1 – 1.21.x', 'Промокод NATUX10: −10%'],
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
