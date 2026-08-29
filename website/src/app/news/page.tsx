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
  'ФИКС': '#35C759',
  'АНОНС': '#4A7FBB',
}

// Классифицированный штамп для каждого типа донесения.
const TAG_STAMP: Record<Tag, string> = {
  'ОБНОВЛЕНИЕ': 'РАЗВЁРНУТО',
  'ИВЕНТ': 'ВНИМАНИЕ',
  'ФИКС': 'УСТРАНЕНО',
  'АНОНС': 'РАССЕКРЕЧЕНО',
}

type NewsItem = {
  code: string
  date: string
  stamp: string
  tag: Tag
  title: string
  desc: string
  details: string[]
}

const NEWS: NewsItem[] = [
  {
    code: '№047',
    date: '01.06.2026 // 12:00 UTC',
    stamp: 'СЕКТОР-Л',
    tag: 'ИВЕНТ',
    title: 'ЛЕТНИЙ ИВЕНТ «ЖАРА»',
    desc: 'Стартует летний ивент NATUX WORLD. Месяц горячих заданий, тематический летний мир с пляжами и тропиками, эксклюзивные косметические награды и удвоенный дроп на выходных. Участвуй и забирай уникальные летние титулы.',
    details: ['x2 дроп по выходным', 'Тематический летний мир', 'Эксклюзивные летние титулы', 'Промокод LAUNCH: −15%'],
  },
  {
    code: '№046',
    date: '24.05.2026 // 09:30 UTC',
    stamp: 'БЕЗОПАСНОСТЬ',
    tag: 'ФИКС',
    title: 'ОБНОВЛЕНИЕ АНТИЧИТА',
    desc: 'Развёрнута новая версия серверного анти-чита. Усилено обнаружение fly/speed/killaura, добавлена серверная проверка отбойного урона и автоматический бан читеров по поведенческим паттернам. Играй честно — система стала умнее.',
    details: ['Детект fly / speed / killaura', 'Серверная проверка урона', 'Авто-бан по паттернам', 'Меньше ложных срабатываний'],
  },
  {
    code: '№045',
    date: '15.05.2026 // 18:00 UTC',
    stamp: 'СНАБЖЕНИЕ',
    tag: 'ОБНОВЛЕНИЕ',
    title: 'НОВЫЕ РАНГИ: KNIGHT И WARLORD',
    desc: 'В магазин добавлены два новых ранга — Knight и Warlord. Расширенные наборы команд, увеличенные лимиты приватов, доступ к закрытым PvP-аренам и уникальные префиксы в чате. Оплата картой или криптой (TON / USDT).',
    details: ['Ранг Knight', 'Ранг Warlord', 'Закрытые PvP-арены', 'Оплата TON / USDT'],
  },
  {
    code: '№044',
    date: '01.05.2026 // 00:00 UTC',
    stamp: 'КОМАНДОВАНИЕ',
    tag: 'АНОНС',
    title: 'NATUX WORLD ОТКРЫТ',
    desc: 'Официальный запуск сервера NATUX WORLD. Свежий мир, дружное комьюнити, продуманный баланс выживания и PvP. Заходи на mc.vibestudy.ru, выбирай ранг и стань частью нового мира с первого дня. Для первых игроков — приветственная скидка.',
    details: ['Свежий старт мира', 'IP: mc.vibestudy.ru', 'Версия 1.20.1 – 1.21.x', 'Промокод NATUX10: −10%'],
  },
]

const MONO = '"JetBrains Mono", monospace'
const DISPLAY = '"Bebas Neue", sans-serif'

export default function NewsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <style>{`
        @keyframes news-stamp-in {
          0% { opacity: 0; transform: rotate(-8deg) scale(1.3); }
          100% { opacity: 1; transform: rotate(-4deg) scale(1); }
        }
        @keyframes news-node-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--node-c); opacity: 1; }
          50% { box-shadow: 0 0 10px 1px var(--node-c); opacity: 0.75; }
        }
        .news-dispatch { position: relative; }
        .news-dispatch::before,
        .news-dispatch::after {
          content: '';
          position: absolute;
          width: 14px;
          height: 14px;
          border-color: #3A1017;
          border-style: solid;
          transition: border-color 0.25s ease;
          pointer-events: none;
          z-index: 3;
        }
        .news-dispatch::before { top: -1px; left: -1px; border-width: 1px 0 0 1px; }
        .news-dispatch::after { bottom: -1px; right: -1px; border-width: 0 1px 1px 0; }
        .news-dispatch:hover::before,
        .news-dispatch:hover::after { border-color: var(--node-c); }
        .news-dispatch:hover .news-card { border-color: rgba(255,255,255,0.12); }
        .news-stamp { animation: news-stamp-in 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .news-node { animation: news-node-pulse 2.8s ease-in-out infinite; }
        details.news-fold > summary { list-style: none; cursor: pointer; user-select: none; }
        details.news-fold > summary::-webkit-details-marker { display: none; }
        details.news-fold[open] > summary .news-fold-chevron { transform: rotate(90deg); }
        @media (prefers-reduced-motion: reduce) {
          .news-stamp, .news-node { animation: none !important; }
        }
      `}</style>

      {/* Header — заголовок журнала донесений */}
      <div className="mb-12">
        <div style={{
          fontFamily: MONO, fontSize: 9, color: '#888',
          letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: '#FF2B4F' }}>{'//'}</span>
          <span>ЖУРНАЛ ОПЕРАТИВНЫХ ДОНЕСЕНИЙ</span>
          <span style={{ flex: 1, height: 1, background: 'rgba(255,43,79,0.25)' }} />
          <span style={{ color: '#35C759' }}>{'> LIVE'}</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 'clamp(36px, 8vw, 64px)', backgroundColor: '#FF2B4F', flexShrink: 0 }} />
          <h1 style={{
            fontFamily: DISPLAY,
            fontSize: 'clamp(36px, 8vw, 64px)',
            letterSpacing: '0.08em', lineHeight: 1, color: '#fff',
          }}>
            ОПЕРАТИВНЫЕ НОВОСТИ
          </h1>
        </div>
        <p style={{
          fontFamily: MONO, fontSize: 10, color: '#888',
          letterSpacing: '0.4em', textTransform: 'uppercase', marginLeft: 15,
        }}>
          ПОСЛЕДНИЕ СОБЫТИЯ НА СЕРВЕРЕ · ВСЕГО ДОНЕСЕНИЙ: {String(NEWS.length).padStart(2, '0')}
        </p>
      </div>

      {/* Timeline — спина журнала слева */}
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 6, bottom: 0,
          width: 1,
          background: 'linear-gradient(to bottom, #FF2B4F, #3A1017 60%, transparent)',
        }} />

        <div style={{ paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 36 }}>
          {NEWS.map((item, i) => {
            const c = TAG_COLOR[item.tag]
            return (
              <div
                key={i}
                className="news-dispatch animate-fade-in-up"
                style={{ position: 'relative', ['--node-c' as string]: c, animationDelay: `${i * 0.09}s` }}
              >
                {/* Узел на спине журнала */}
                <div style={{
                  position: 'absolute', left: -34, top: 5,
                  width: 9, height: 9,
                  backgroundColor: '#070707',
                  border: `2px solid ${c}`,
                  transform: 'rotate(45deg)',
                  zIndex: 2,
                }} />
                <div
                  className="news-node"
                  style={{
                    position: 'absolute', left: -32, top: 7,
                    width: 5, height: 5, backgroundColor: c,
                    transform: 'rotate(45deg)',
                    ['--node-c' as string]: c, zIndex: 2,
                  }}
                />
                {/* Тонкая сцепка узел → карточка */}
                <div style={{
                  position: 'absolute', left: -26, top: 9,
                  width: 26, height: 1, background: `linear-gradient(90deg, ${c}, transparent)`,
                }} />

                {/* Карточка-донесение */}
                <div
                  className="news-card"
                  style={{
                    backgroundColor: '#130a0b',
                    border: '1px solid #3A1017',
                    transition: 'border-color 0.25s ease',
                    clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
                    position: 'relative',
                  }}
                >
                  {/* Верхняя полоса донесения */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 18px',
                    borderBottom: '1px solid #1c0a0e',
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.015), transparent)',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 10, fontWeight: 700,
                      color: '#fff', letterSpacing: '0.15em',
                    }}>
                      ДОНЕСЕНИЕ <span style={{ color: c }}>{item.code}</span>
                    </span>
                    <span style={{ width: 1, height: 11, background: '#2a1010' }} />
                    <span style={{
                      fontFamily: MONO, fontSize: 9, color: '#888',
                      letterSpacing: '0.25em', textTransform: 'uppercase',
                    }}>{item.date}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{
                      fontFamily: MONO, fontSize: 8, color: '#888',
                      letterSpacing: '0.3em', textTransform: 'uppercase',
                    }}>{item.stamp}</span>
                  </div>

                  <div style={{ padding: '16px 18px 18px' }}>
                    {/* Классифицированный штамп + категория */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span
                        className="news-stamp"
                        style={{
                          display: 'inline-block',
                          fontFamily: MONO, fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.18em', textTransform: 'uppercase',
                          color: c,
                          border: `1.5px solid ${c}`,
                          padding: '3px 10px',
                          transformOrigin: 'left center',
                          boxShadow: `inset 0 0 0 1px ${c}22`,
                        }}
                      >
                        {TAG_STAMP[item.tag]}
                      </span>
                      <span style={{
                        fontFamily: MONO, fontSize: 8, color: '#888',
                        letterSpacing: '0.3em', textTransform: 'uppercase',
                      }}>
                        {'// КЛАСС: '}<span style={{ color: c }}>{item.tag}</span>
                      </span>
                    </div>

                    {/* Заголовок */}
                    <h2 style={{
                      fontFamily: DISPLAY, fontSize: 26, letterSpacing: '0.05em',
                      color: '#fff', marginBottom: 10, lineHeight: 1.05,
                    }}>{item.title}</h2>

                    {/* Текст донесения */}
                    <p style={{
                      fontFamily: MONO, fontSize: 12, color: '#B8B8B8',
                      lineHeight: 1.75, marginBottom: 14,
                    }}>
                      <span style={{ color: c, marginRight: 6 }}>{'>'}</span>
                      {item.desc}
                    </p>

                    {/* Раскрываемый список пунктов */}
                    <details className="news-fold">
                      <summary style={{
                        fontFamily: MONO, fontSize: 9, color: '#888',
                        letterSpacing: '0.3em', textTransform: 'uppercase',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 0', borderTop: '1px solid #1c0a0e',
                      }}>
                        <span
                          className="news-fold-chevron"
                          style={{ color: c, transition: 'transform 0.2s ease', display: 'inline-block' }}
                        >{'>'}</span>
                        ПОДРОБНОСТИ ОПЕРАЦИИ · {String(item.details.length).padStart(2, '0')} ПУНКТ.
                      </summary>
                      <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {item.details.map((d, di) => (
                          <div
                            key={d}
                            style={{
                              display: 'flex', alignItems: 'baseline', gap: 10,
                              padding: '7px 0',
                              borderBottom: di === item.details.length - 1 ? 'none' : '1px solid rgba(58,16,23,0.5)',
                            }}
                          >
                            <span style={{
                              fontFamily: MONO, fontSize: 9, color: c,
                              letterSpacing: '0.15em', flexShrink: 0,
                            }}>{'// ПУНКТ ' + String(di + 1).padStart(2, '0')}</span>
                            <span style={{
                              fontFamily: MONO, fontSize: 11, color: '#ccc', letterSpacing: '0.02em',
                            }}>{d}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Конец журнала */}
          <div style={{ position: 'relative', paddingTop: 4 }}>
            <div style={{
              position: 'absolute', left: -33, top: 6,
              width: 7, height: 7, backgroundColor: '#3A1017',
              transform: 'rotate(45deg)',
            }} />
            <span style={{
              fontFamily: MONO, fontSize: 9, color: '#888',
              letterSpacing: '0.3em', textTransform: 'uppercase',
            }}>{'// КОНЕЦ ЖУРНАЛА'}<span className="cursor-blink" /></span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 48, textAlign: 'center' }}>
        <p style={{
          fontFamily: MONO, fontSize: 10, color: '#888',
          letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 16,
        }}>
          {'// СЛЕДИ ЗА ДОНЕСЕНИЯМИ В СОЦСЕТЯХ'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/shop"
            className="bg-[#FF2B4F] hover:bg-[#cc1a35] transition-colors duration-200"
            style={{
              fontFamily: DISPLAY, fontSize: 15,
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
              fontFamily: MONO, fontSize: 11,
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
