'use client'

import React, { useState, useEffect } from 'react'
import ServerStatus from '@/components/ServerStatus'
import { BRAND } from '@/lib/brand'

const IP = BRAND.serverHost

const MONO = '"JetBrains Mono", monospace'
const DISPLAY = '"Bebas Neue", sans-serif'

// ─── лаунчер NATUX WORLD ───────────────────────────────────────────────────────
// Релизы: https://github.com/Alex-dev-sys/NatuxWorld/releases
// Имена ассетов содержат версию — при бампе достаточно поменять LAUNCHER_VERSION.
const LAUNCHER_VERSION = '1.9.4'
const REL = `https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v${LAUNCHER_VERSION}`
const DL_WIN = `${REL}/NATUX-WORLD-Setup-${LAUNCHER_VERSION}-x64.exe`
const DL_MAC_ARM = `${REL}/NATUX-WORLD-${LAUNCHER_VERSION}-arm64.dmg`
const DL_MAC_X64 = `${REL}/NATUX-WORLD-${LAUNCHER_VERSION}-x64.dmg`

// Преимущества фирменного лаунчера над ручным подключением.
const LAUNCHER_PERKS = [
  { t: 'JAVA НЕ НУЖНА', d: 'Среда зашита в лаунчер — ничего ставить отдельно не надо.' },
  { t: 'ПОДКЛЮЧЕНИЕ В 1 КЛИК', d: 'Сервер уже прописан. Жми «Играть» — ты в игре.' },
  { t: 'АВТО-ОБНОВЛЕНИЯ', d: 'Клиент, версия и сборка модов обновляются сами.' },
  { t: 'ВЕРНАЯ ВЕРСИЯ', d: 'Совместимость с узлом гарантирована — без «Outdated client».' },
  { t: 'ОПТИМИЗАЦИЯ FPS', d: 'Преднастроенные параметры производительности из коробки.' },
]

// Три шага для пути через лаунчер.
const STEPS = [
  { n: '01', subtitle: 'ЗАГРУЗКА ПАКЕТА', title: 'СКАЧАТЬ ЛАУНЧЕР', desc: 'Скачай установщик для своей ОС кнопкой выше. Размер ~90 МБ.', note: 'Windows · macOS' },
  { n: '02', subtitle: 'РАЗВЁРТЫВАНИЕ', title: 'УСТАНОВИТЬ', desc: 'Запусти установщик. На первом старте лаунчер сам докачает клиент и сборку.', note: 'Первый старт ~1 мин' },
  { n: '03', subtitle: 'ВХОД В ОПЕРАЦИЮ', title: 'НАЖАТЬ «ИГРАТЬ»', desc: 'Введи ник, нажми «Играть» — подключение к узлу автоматическое.', note: 'Лицензия не требуется' },
]

const VERSIONS = ['1.20.1', '1.20.2', '1.20.4', '1.20.6', '1.21', '1.21.1', '1.21.4']

type OS = 'win' | 'mac' | null

export default function JoinPage() {
  const [copied, setCopied] = useState(false)
  const [os, setOs] = useState<OS>(null)
  const [showManual, setShowManual] = useState(false)

  // Авто-определение ОС — подсветить нужную кнопку загрузки.
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac')) setOs('mac')
    else if (ua.includes('win')) setOs('win')
    else setOs('win')
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(IP).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10" style={{ position: 'relative' }}>
        {/* header text */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, color: '#888',
            letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ color: '#FF2B4F' }}>{'//'}</span>
            <span>ПРОТОКОЛ РАЗВЁРТЫВАНИЯ</span>
            <span style={{ flex: 1, minWidth: 30, height: 1, background: 'rgba(255,43,79,0.25)' }} />
            <span style={{ color: '#35C759' }}>{'> ЛАУНЧЕР v' + LAUNCHER_VERSION}</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div style={{ width: 3, height: 'clamp(36px, 8vw, 64px)', backgroundColor: '#FF2B4F', flexShrink: 0 }} />
            <h1 style={{
              fontFamily: DISPLAY, fontSize: 'clamp(36px, 8vw, 64px)',
              letterSpacing: '0.08em', lineHeight: 1, color: '#fff',
            }}>
              ПОДКЛЮЧИТЬСЯ
            </h1>
          </div>
          <p style={{
            fontFamily: MONO, fontSize: 10, color: '#888',
            letterSpacing: '0.4em', textTransform: 'uppercase', marginLeft: 15,
          }}>
            ОФИЦИАЛЬНЫЙ ЛАУНЧЕР NATUX WORLD — ИГРА В 1 КЛИК
          </p>
        </div>
      </div>

      {/* ── ГЛАВНЫЙ БЛОК: лаунчер ── */}
      <div style={{
        backgroundColor: '#140a0b', border: '1px solid #FF2B4F40',
        marginBottom: 28, position: 'relative', overflow: 'hidden',
        clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))',
        boxShadow: '0 0 60px -22px #FF2B4F88',
      }}>
        {/* верхняя кромка */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #FF2B4F, transparent)',
        }} />

        {/* шапка */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 22px', borderBottom: '1px solid #1c0a0e',
        }}>
          <span style={{ width: 7, height: 7, background: '#FF2B4F', transform: 'rotate(45deg)' }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: '#888', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            NATUX://LAUNCHER
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: '#888', letterSpacing: '0.3em', textTransform: 'uppercase' }}>СТАТУС</span>
          <ServerStatus compact />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 0 }} className="md:grid-cols-[1.1fr_1fr]">
          {/* левая колонка: питч + загрузка */}
          <div style={{ padding: '26px 24px', borderBottom: '1px solid #1c0a0e' }} className="md:border-b-0 md:border-r md:border-r-[#1c0a0e]">
            <div style={{
              fontFamily: MONO, fontSize: 9, color: '#FF2B4F',
              letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 12,
            }}>{'// РЕКОМЕНДУЕМЫЙ СПОСОБ'}</div>

            <h2 style={{
              fontFamily: DISPLAY, fontSize: 'clamp(26px, 6vw, 38px)', lineHeight: 1.02,
              letterSpacing: '0.04em', color: '#fff', marginBottom: 10,
            }}>
              СКАЧАЙ ЛАУНЧЕР —<br />И СРАЗУ В ИГРУ
            </h2>
            <p style={{ fontFamily: MONO, fontSize: 11, color: '#B8B8B8', lineHeight: 1.7, marginBottom: 20 }}>
              Никакой ручной установки Java и поиска версий. Лаунчер сам ставит клиент,
              держит его в актуальном состоянии и подключает к узлу одной кнопкой.
            </p>

            {/* кнопки загрузки */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href={DL_WIN}
                className={`dl-btn ${os === 'win' ? 'dl-primary' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  textDecoration: 'none',
                  background: os === 'win'
                    ? 'linear-gradient(135deg, #FF2B4F, #c01530)'
                    : '#070707',
                  border: `1px solid ${os === 'win' ? '#FF2B4F' : '#3A1017'}`,
                  clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                }}
                onMouseEnter={e => { if (os !== 'win') (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F' }}
                onMouseLeave={e => { if (os !== 'win') (e.currentTarget as HTMLElement).style.borderColor = '#3A1017' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill={os === 'win' ? '#fff' : '#888'} style={{ flexShrink: 0 }}>
                  <path d="M3 5.5L10.5 4.5V11.5H3V5.5ZM3 12.5H10.5V19.5L3 18.5V12.5ZM11.5 4.3L21 3V11.5H11.5V4.3ZM11.5 12.5H21V21L11.5 19.7V12.5Z" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: '0.06em', color: os === 'win' ? '#fff' : '#ddd' }}>
                    СКАЧАТЬ ДЛЯ WINDOWS
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', color: os === 'win' ? '#ffffffcc' : '#888' }}>
                    .EXE · 64-bit · v{LAUNCHER_VERSION}
                  </div>
                </div>
                {os === 'win' && (
                  <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: '#fff', border: '1px solid #ffffff66', padding: '3px 7px' }}>
                    ТВОЯ ОС
                  </span>
                )}
              </a>

              <a
                href={DL_MAC_ARM}
                className={`dl-btn ${os === 'mac' ? 'dl-primary' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  textDecoration: 'none',
                  background: os === 'mac'
                    ? 'linear-gradient(135deg, #FF2B4F, #c01530)'
                    : '#070707',
                  border: `1px solid ${os === 'mac' ? '#FF2B4F' : '#3A1017'}`,
                  clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                }}
                onMouseEnter={e => { if (os !== 'mac') (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F' }}
                onMouseLeave={e => { if (os !== 'mac') (e.currentTarget as HTMLElement).style.borderColor = '#3A1017' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill={os === 'mac' ? '#fff' : '#888'} style={{ flexShrink: 0 }}>
                  <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1.1 2.6-2.2.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.5zM14.2 5.8c.6-.7 1-1.7.9-2.8-.9 0-1.9.6-2.6 1.3-.5.6-1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2z" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: '0.06em', color: os === 'mac' ? '#fff' : '#ddd' }}>
                    СКАЧАТЬ ДЛЯ MACOS
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', color: os === 'mac' ? '#ffffffcc' : '#888' }}>
                    .DMG · Apple Silicon (M1–M4) · v{LAUNCHER_VERSION}
                  </div>
                </div>
                {os === 'mac' && (
                  <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: '#fff', border: '1px solid #ffffff66', padding: '3px 7px' }}>
                    ТВОЯ ОС
                  </span>
                )}
              </a>

              {/* macOS Intel — вторичный билд (у Apple Silicon нет универсального .dmg) */}
              <a
                href={DL_MAC_X64}
                className="join-link"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                  textDecoration: 'none', marginTop: -2,
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: '#888',
                  border: '1px solid #2a1010', background: '#070707',
                  clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F'; (e.currentTarget as HTMLElement).style.color = '#FF2B4F' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a1010'; (e.currentTarget as HTMLElement).style.color = '#888' }}
              >
                <span style={{ color: '#FF2B4F' }}>{'//'}</span>
                <span>MAC НА INTEL? СКАЧАТЬ .DMG x64</span>
              </a>
            </div>

            <p style={{ fontFamily: MONO, fontSize: 9, color: '#666', letterSpacing: '0.1em', marginTop: 12, lineHeight: 1.6 }}>
              {'// '}СБОРКА БЕЗ ПОДПИСИ — ПРИ ПРЕДУПРЕЖДЕНИИ SMARTSCREEN / GATEKEEPER ВЫБЕРИ «ВСЁ РАВНО ЗАПУСТИТЬ»
            </p>
          </div>

          {/* правая колонка: преимущества */}
          <div style={{ padding: '26px 24px' }}>
            <div style={{
              fontFamily: MONO, fontSize: 9, color: '#888',
              letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 14,
            }}>{'// ЧТО ДАЁТ ЛАУНЧЕР'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {LAUNCHER_PERKS.map(p => (
                <div key={p.t} className="perk-row" style={{
                  display: 'flex', gap: 12, padding: '10px 12px',
                  border: '1px solid #1c0a0e', background: '#0c0708',
                  clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}>
                  <span style={{ marginTop: 5, width: 6, height: 6, flexShrink: 0, background: '#FF2B4F', transform: 'rotate(45deg)', boxShadow: '0 0 6px #FF2B4F99' }} />
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.08em', marginBottom: 3 }}>{p.t}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: '#999', lineHeight: 1.5 }}>{p.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Шаги через лаунчер */}
      <div style={{
        fontFamily: MONO, fontSize: 9, color: '#888',
        letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: '#FF2B4F' }}>{'//'}</span>
        <span>ПОСЛЕДОВАТЕЛЬНОСТЬ ЗАПУСКА</span>
        <span style={{ flex: 1, height: 1, background: 'rgba(255,43,79,0.25)' }} />
        <span style={{ color: '#35C759' }}>{'> 3 ШАГА'}</span>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="hidden md:block" style={{
          position: 'absolute', top: 30, left: 24, right: 24, height: 1,
          background: 'linear-gradient(90deg, #FF2B4F, #3A1017 50%, transparent)', zIndex: 0,
        }} />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, position: 'relative', zIndex: 1,
        }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="join-step animate-fade-in-up"
              style={{
                backgroundColor: '#140a0b', border: '1px solid #3A1017',
                padding: '20px 18px', cursor: 'default', animationDelay: `${i * 0.08}s`,
                clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 2 }}>ШАГ</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 40, lineHeight: 0.85, color: '#fff', letterSpacing: '0.03em' }}>{step.n}</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 28, color: '#1c0a0e', lineHeight: 1 }}>{'///'}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: '#FF2B4F', letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 5 }}>{step.subtitle}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 21, letterSpacing: '0.05em', color: '#fff', marginBottom: 10, lineHeight: 1.05 }}>{step.title}</div>
              <div style={{ width: 28, height: 2, backgroundColor: '#FF2B4F', marginBottom: 12 }} />
              <p style={{ fontFamily: MONO, fontSize: 11, color: '#B8B8B8', lineHeight: 1.7, marginBottom: 14 }}>{step.desc}</p>
              <span style={{
                display: 'inline-block', fontFamily: MONO, fontSize: 9, color: '#888',
                backgroundColor: '#070707', border: '1px solid #2a1010', padding: '4px 10px', letterSpacing: '0.08em',
                clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
              }}>{'// ' + step.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ручное подключение (вторичный путь, сворачиваемый) ── */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setShowManual(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            background: '#0c0708', border: '1px solid #3A1017', cursor: 'pointer',
            padding: '14px 18px', textAlign: 'left',
            clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F50' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017' }}
        >
          <span style={{ width: 7, height: 7, background: '#888', transform: 'rotate(45deg)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#ccc', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Подключиться вручную
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#777', letterSpacing: '0.1em', marginTop: 3 }}>
              {'// БЕЗ ЛАУНЧЕРА — ЧЕРЕЗ ОФИЦИАЛЬНЫЙ MINECRAFT ИЛИ TLAUNCHER'}
            </div>
          </div>
          <span style={{
            fontFamily: MONO, fontSize: 18, color: '#FF2B4F',
            transform: showManual ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease',
          }}>›</span>
        </button>

        {showManual && (
          <div className="animate-fade-in-up" style={{
            marginTop: 12, backgroundColor: '#140a0b', border: '1px solid #3A1017',
            padding: '22px 24px',
            clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
          }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#888', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 8 }}>
              {'// АДРЕС УЗЛА — ВСТАВЬ В «МУЛЬТИПЛЕЕР → ДОБАВИТЬ СЕРВЕР»'}
            </div>

            {/* IP copy */}
            <button
              onClick={copy}
              className="join-ip-field"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                position: 'relative', overflow: 'hidden',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                backgroundColor: copied ? '#35C75912' : '#070707',
                border: `1px solid ${copied ? '#35C75960' : '#3A1017'}`,
                clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
              }}
              onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F' }}
              onMouseLeave={e => { if (!copied) (e.currentTarget as HTMLElement).style.borderColor = '#3A1017' }}
            >
              <span className="join-ip-scan" style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
                background: 'linear-gradient(90deg, transparent, rgba(255,43,79,0.08), transparent)',
                opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none',
                animation: 'join-scan 2.4s linear infinite',
              }} />
              <span style={{ fontFamily: MONO, fontSize: 14, color: copied ? '#35C759' : '#FF2B4F', fontWeight: 700, flexShrink: 0 }}>$</span>
              <span style={{ fontFamily: MONO, fontSize: 'clamp(15px, 4vw, 20px)', fontWeight: 700, letterSpacing: '0.05em', color: copied ? '#35C759' : '#fff' }}>{IP}</span>
              <span className="join-cur" style={{ fontFamily: MONO, fontSize: 'clamp(15px, 4vw, 20px)', color: copied ? '#35C759' : '#FF2B4F', marginLeft: -6 }}>_</span>
              <span style={{ flex: 1 }} />
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
                textTransform: 'uppercase', color: copied ? '#35C759' : '#888', flexShrink: 0,
              }}>
                {copied ? (
                  <>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    <span className="hidden sm:inline">СКОПИРОВАНО</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    <span className="hidden sm:inline">КОПИРОВАТЬ</span>
                  </>
                )}
              </span>
            </button>

            {/* совместимые версии */}
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', margin: '18px 0 10px' }}>
              {'// СОВМЕСТИМЫЕ ВЕРСИИ'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {VERSIONS.map(v => (
                <span key={v} style={{
                  fontFamily: MONO, fontSize: 11, color: '#ccc',
                  backgroundColor: '#070707', border: '1px solid #2a1010', padding: '4px 12px', letterSpacing: '0.04em',
                  clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))',
                }}>{v}</span>
              ))}
            </div>
            <p style={{ fontFamily: MONO, fontSize: 10, color: '#888', lineHeight: 1.7, marginTop: 14 }}>
              Нужна Java 17+ (adoptium.net) и любой лаунчер Minecraft / TLauncher. Лицензия не требуется.
            </p>
          </div>
        )}
      </div>

      {/* Faux-терминал: лог соединения */}
      <div style={{
        marginTop: 32, backgroundColor: '#070707', border: '1px solid #3A1017',
        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #1c0a0e' }}>
          <span style={{ width: 8, height: 8, border: '1px solid #FF2B4F', borderRadius: '50%' }} />
          <span style={{ width: 8, height: 8, border: '1px solid #888', borderRadius: '50%' }} />
          <span style={{ width: 8, height: 8, border: '1px solid #888', borderRadius: '50%' }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: '#888', letterSpacing: '0.3em', textTransform: 'uppercase', marginLeft: 6 }}>launcher.log</span>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { p: '$', t: 'natux-launcher --connect', d: '#ccc' },
            { p: '>', t: 'ПРОВЕРКА ОБНОВЛЕНИЙ … OK', d: '#888' },
            { p: '>', t: 'ВЕРСИЯ КЛИЕНТА СИНХРОНИЗИРОВАНА … OK', d: '#888' },
            { p: '>', t: 'УЗЕЛ mc.vibestudy.ru ДОСТУПЕН · НАЖМИ «ИГРАТЬ»', d: '#35C759', cur: true },
          ].map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: line.d === '#35C759' ? '#35C759' : '#FF2B4F', flexShrink: 0 }}>{line.p}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: line.d, letterSpacing: '0.03em' }}>
                {line.t}
                {line.cur ? <span className="join-cur" style={{ color: '#35C759', marginLeft: 4 }}>_</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Канал связи */}
      <div style={{
        marginTop: 16, backgroundColor: '#140a0b', border: '1px solid #3A1017', padding: '18px 20px',
        clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 12 }}>
          {'// КАНАЛ СВЯЗИ'}
        </div>
        <p style={{ fontFamily: MONO, fontSize: 11, color: '#B8B8B8', lineHeight: 1.6, marginBottom: 14 }}>
          Лаунчер не ставится или вопрос по подключению? Выходи на связь — ответим в течение нескольких часов.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href="https://vk.com/natuxworld" target="_blank" rel="noopener noreferrer" className="join-link"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase',
              border: '1px solid #3A1017', padding: '8px 18px', textDecoration: 'none',
              clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F'; (e.currentTarget as HTMLElement).style.color = '#FF2B4F' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#888' }}
          >VK</a>
          <a
            href="https://discord.gg/natuxworld" target="_blank" rel="noopener noreferrer" className="join-link"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase',
              border: '1px solid #3A1017', padding: '8px 18px', textDecoration: 'none',
              clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#5865F2'; (e.currentTarget as HTMLElement).style.color = '#5865F2' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#888' }}
          >DISCORD</a>
        </div>
      </div>
    </div>
  )
}
