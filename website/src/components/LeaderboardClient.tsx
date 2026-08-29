'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Podium3DProps } from '@/components/three/Podium3D'

// Скелет на время загрузки чанка three (вместо пустоты) — пьедестал не «пропадает».
function PodiumSkeleton() {
  return (
    <div style={{ position: 'relative', width: '100%', height: 300, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, opacity: 0.5 }}>
        {[2.1, 3.3, 1.5].map((h, i) => (
          <div key={i} style={{
            width: 56, height: h * 26,
            background: 'linear-gradient(180deg, #1a0e0f, #120a0b)',
            border: '1px solid #2a1416', borderRadius: 4,
            animation: 'pdm-pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.15}s`,
          }} />
        ))}
      </div>
      <style>{`@keyframes pdm-pulse { 0%,100%{opacity:0.4} 50%{opacity:0.75} }`}</style>
    </div>
  )
}

const Podium3D = dynamic(() => import('@/components/three/Podium3D'), {
  ssr: false,
  loading: () => <PodiumSkeleton />,
})

type Player = {
  rank: number
  name: string
  kills: number
  deaths: number
  kd: number
  playtime: string
  playtimeH: number
  color: string
}

const PLAYERS: Player[] = [
  { rank: 1, name: 'xX_Notch_Xx',   kills: 4821, deaths: 312,  kd: 15.45, playtime: '847ч',  playtimeH: 847, color: '#FF2B4F' },
  { rank: 2, name: 'DarkSword228',   kills: 3904, deaths: 489,  kd: 7.98,  playtime: '1203ч', playtimeH: 1203, color: '#4A7FBB' },
  { rank: 3, name: 'VoidWalker',     kills: 3541, deaths: 201,  kd: 17.61, playtime: '622ч',  playtimeH: 622, color: '#9B59B6' },
  { rank: 4, name: 'StarlightGG',    kills: 2987, deaths: 654,  kd: 4.57,  playtime: '1589ч', playtimeH: 1589, color: '#50C878' },
  { rank: 5, name: 'NightRaider',    kills: 2764, deaths: 331,  kd: 8.35,  playtime: '743ч',  playtimeH: 743, color: '#F0A500' },
  { rank: 6, name: 'IronForge',      kills: 2301, deaths: 408,  kd: 5.64,  playtime: '921ч',  playtimeH: 921, color: '#FF6B35' },
  { rank: 7, name: 'PvPmaster99',    kills: 1988, deaths: 287,  kd: 6.93,  playtime: '511ч',  playtimeH: 511, color: '#17A589' },
  { rank: 8, name: 'ZombieSlayer',   kills: 1745, deaths: 512,  kd: 3.41,  playtime: '678ч',  playtimeH: 678, color: '#E74C3C' },
  { rank: 9, name: 'DiamondBlade',   kills: 1433, deaths: 299,  kd: 4.79,  playtime: '834ч',  playtimeH: 834, color: '#3498DB' },
  { rank: 10, name: 'CreeperKing',   kills: 1204, deaths: 187,  kd: 6.44,  playtime: '1102ч', playtimeH: 1102, color: '#27AE60' },
]

type Tab = 'kills' | 'time' | 'kd'

// Эскалирующая отделка топ-3: золото / серебро / бронза
const EDGE = ['#F0A500', '#C8CCD2', '#CD7F32']
const EDGE_LABEL = ['ЗОЛОТО', 'СЕРЕБРО', 'БРОНЗА']

function sorted(tab: Tab): Player[] {
  if (tab === 'kills') return [...PLAYERS].sort((a, b) => b.kills - a.kills)
  if (tab === 'time')  return [...PLAYERS].sort((a, b) => b.playtimeH - a.playtimeH)
  return [...PLAYERS].sort((a, b) => b.kd - a.kd)
}

function statValue(p: Player, tab: Tab): string {
  if (tab === 'kills') return p.kills.toLocaleString('ru-RU')
  if (tab === 'time') return p.playtime
  return p.kd.toFixed(2)
}

function statBasis(p: Player, tab: Tab): number {
  if (tab === 'kills') return p.kills
  if (tab === 'time') return p.playtimeH
  return p.kd
}

export default function LeaderboardClient() {
  const [tab, setTab] = useState<Tab>('kills')
  const [reducedMotion, setReducedMotion] = useState(false)
  const list = sorted(tab)
  const topBasis = statBasis(list[0], tab)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    // тёплый preload чанка three+Podium сразу при заходе — рендерится без задержки
    import('@/components/three/Podium3D')
    return () => mq.removeEventListener('change', handler)
  }, [])

  const top3Players: Podium3DProps['top3'] = list.slice(0, 3).map((p) => ({
    name: p.name,
    value: statValue(p, tab),
    color: p.color,
  }))

  const TABS: { id: Tab; label: string; code: string }[] = [
    { id: 'kills', label: 'ПО УБИЙСТВАМ', code: 'KILLS' },
    { id: 'time',  label: 'ПО ВРЕМЕНИ', code: 'UPTIME' },
    { id: 'kd',    label: 'ПО K/D', code: 'RATIO' },
  ]

  return (
    <div className="lb-root max-w-5xl mx-auto px-4 py-12">
      <style>{`
        .lb-table-row { transition: background 0.16s ease, box-shadow 0.16s ease; }
        .lb-table-row:hover { background: #160a0c !important; }
        .lb-bar-fill { transform-origin: left; animation: lb-bar-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes lb-bar-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .lb-tab { transition: all 0.18s ease; }
        .lb-tab:hover { color: #ddd; border-color: #FF2B4F88; }
        .lb-slot { animation: lb-fade 0.5s ease-out both; }
        @keyframes lb-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .lb-bar-fill, .lb-slot { animation: none; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#FF2B4F', letterSpacing: '0.4em', marginBottom: 10 }}>
          {'// ЛИЧНЫЙ СОСТАВ'}
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 30, backgroundColor: '#FF2B4F' }} className="glow-red" />
          <h1
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(40px, 9vw, 72px)',
              letterSpacing: '0.06em',
              lineHeight: 0.95,
              color: '#fff',
            }}
          >
            БОЕВОЙ РЕЙТИНГ
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ marginLeft: 15 }}>
          <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#888', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
            {'>'} ТАБЛИЦА ЛИЧНОГО СОСТАВА · {list.length} ОПЕРАТИВНИКОВ
          </p>
          <span className="flex items-center gap-1.5" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#35C759', letterSpacing: '0.2em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#35C759' }} className="animate-pulse-dot" />
            СИНХРОНИЗАЦИЯ АКТИВНА
          </span>
        </div>
      </div>

      {/* 3D Podium — top-3 for the current tab */}
      <div
        style={{
          border: '1px solid #3A1017',
          background: 'linear-gradient(180deg, #0d0407 0%, #070707 100%)',
          overflow: 'hidden',
          marginBottom: 28,
        }}
        className="clip-angle"
      >
        <div style={{ padding: '10px 18px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.35em', color: '#FF2B4F' }}>
            {'// ПЬЕДЕСТАЛ'}
          </span>
        </div>
        <Podium3D top3={top3Players} reducedMotion={reducedMotion} />
      </div>

      {/* Tab switcher — terminal toggles */}
      <div className="flex gap-2 mb-7 flex-wrap">
        {TABS.map(t => {
          const on = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="lb-tab clip-angle-sm"
              style={{
                padding: '9px 18px',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: `1px solid ${on ? '#FF2B4F' : '#3A1017'}`,
                background: on ? '#FF2B4F18' : '#130a0b',
                color: on ? '#FF2B4F' : '#888',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: on ? '#FF2B4F' : '#3A1017' }}>{on ? '[•]' : '[ ]'}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Top-3 dossier cards */}
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {list.slice(0, 3).map((p, i) => {
          const edge = EDGE[i]
          return (
            <div
              key={p.name}
              className="lb-slot corner-brackets clip-angle"
              style={{
                position: 'relative',
                background: `linear-gradient(160deg, ${edge}14, #130a0b 60%)`,
                border: `1px solid ${edge}55`,
                borderTop: `2px solid ${edge}`,
                padding: '16px 18px',
                animationDelay: `${i * 0.08}s`,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.3em', color: edge, marginBottom: 2 }}>
                    {EDGE_LABEL[i]}
                  </div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 38, lineHeight: 0.9, color: edge, letterSpacing: '0.04em' }}>
                    {`#0${i + 1}`}
                  </div>
                </div>
                <div style={{
                  width: 44, height: 44, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `radial-gradient(circle at 35% 30%, ${p.color}cc, ${p.color}33)`,
                  boxShadow: `0 0 16px ${p.color}55`,
                  border: `2px solid ${edge}`,
                  clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                }}>
                  <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: '#fff' }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.25em', color: '#666', marginBottom: 2 }}>
                ПОЗЫВНОЙ
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 12, wordBreak: 'break-all' }}>
                {p.name}
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.25em', color: '#666' }}>
                    {tab === 'kills' ? 'УБИЙСТВА' : tab === 'time' ? 'НАЛЁТ' : 'K/D'}
                  </div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 32, color: '#fff', letterSpacing: '0.03em', fontVariantNumeric: 'tabular-nums' }}>
                    {statValue(p, tab)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#888', lineHeight: 1.6 }}>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>K {p.kills.toLocaleString('ru-RU')}</div>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>D {p.deaths.toLocaleString('ru-RU')}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Roster table */}
      <div className="scanline clip-angle" style={{ border: '1px solid #3A1017', overflow: 'hidden', backgroundColor: '#130a0b' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px minmax(120px, 1fr) 92px 72px 64px 84px',
          padding: '11px 18px',
          borderBottom: '1px solid #3A1017',
          background: '#0a0405',
        }}>
          {['СЛОТ', 'ПОЗЫВНОЙ', 'УБИЙСТВА', 'СМЕРТИ', 'K/D', 'НАЛЁТ'].map((col, ci) => (
            <span key={col} style={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
              color: '#7a3540', letterSpacing: '0.3em', textTransform: 'uppercase',
              textAlign: ci >= 2 ? 'right' : 'left',
            }}>{col}</span>
          ))}
        </div>

        {list.map((p, i) => {
          const top3 = i < 3
          const edge = top3 ? EDGE[i] : null
          const barPct = Math.max(4, Math.round((statBasis(p, tab) / topBasis) * 100))
          return (
            <div
              key={p.name}
              className="lb-table-row"
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: '52px minmax(120px, 1fr) 92px 72px 64px 84px',
                padding: '13px 18px',
                borderBottom: i < list.length - 1 ? '1px solid #160808' : 'none',
                borderLeft: top3 ? `2px solid ${edge}` : '2px solid transparent',
                background: i === 0 ? 'linear-gradient(90deg, #FF2B4F0e, transparent 40%)' : 'transparent',
                alignItems: 'center',
              }}
            >
              {/* Bar viz — kills relative to top */}
              <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${barPct}%`, background: edge ?? '#FF2B4F', opacity: edge ? 0.6 : 0.22 }} className="lb-bar-fill" />

              {/* Slot # */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 22,
                color: edge ?? '#5a2730',
                letterSpacing: '0.04em',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {`#${String(i + 1).padStart(2, '0')}`}
              </span>

              {/* Callsign */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <div style={{
                  width: 26, height: 26, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `radial-gradient(circle at 35% 35%, ${p.color}cc, ${p.color}44)`,
                  boxShadow: top3 ? `0 0 8px ${p.color}55` : 'none',
                  clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
                }}>
                  <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 13, color: '#fff' }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span style={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 12.5,
                  fontWeight: 700,
                  color: i === 0 ? '#FF2B4F' : top3 ? '#fff' : '#ccc',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</span>
              </div>

              {/* Kills */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 22,
                color: tab === 'kills' ? '#fff' : '#666',
                letterSpacing: '0.03em', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>{p.kills.toLocaleString('ru-RU')}</span>

              {/* Deaths */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 22,
                color: '#4a4a4a', letterSpacing: '0.03em', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>{p.deaths.toLocaleString('ru-RU')}</span>

              {/* KD */}
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 14, fontWeight: 700,
                color: tab === 'kd' ? '#fff' : '#777',
                textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>{p.kd.toFixed(2)}</span>

              {/* Playtime */}
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                color: tab === 'time' ? '#FF2B4F' : '#777',
                textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>{p.playtime}</span>
            </div>
          )
        })}
      </div>

      {/* Footer note — honest demo disclosure */}
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginTop: 18 }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#7a3540', letterSpacing: '0.3em', textTransform: 'uppercase',
        }}>
          {'// ДЕМО-ДАННЫЕ · ОБРАЗЕЦ ИНТЕРФЕЙСА'}
        </span>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#555', letterSpacing: '0.25em', textTransform: 'uppercase',
        }}>
          {'>'} ОБНОВЛЕНИЕ ПОСЛЕ ЗАПУСКА СЕРВЕРА
        </span>
      </div>
    </div>
  )
}
