'use client'

import { useState } from 'react'

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

const MEDAL = ['🥇', '🥈', '🥉']
const MEDAL_COLOR = ['#F0A500', '#B0BEC5', '#CD7F32']

function sorted(tab: Tab): Player[] {
  if (tab === 'kills') return [...PLAYERS].sort((a, b) => b.kills - a.kills)
  if (tab === 'time')  return [...PLAYERS].sort((a, b) => b.playtimeH - a.playtimeH)
  return [...PLAYERS].sort((a, b) => b.kd - a.kd)
}

export default function LeaderboardClient() {
  const [tab, setTab] = useState<Tab>('kills')
  const list = sorted(tab)
  const top3 = list.slice(0, 3)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'kills', label: 'ПО УБИЙСТВАМ' },
    { id: 'time',  label: 'ПО ВРЕМЕНИ' },
    { id: 'kd',    label: 'ПО K/D' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 28, backgroundColor: '#FF2B4F', borderRadius: 2 }} />
          <h1
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(36px, 8vw, 64px)',
              letterSpacing: '0.08em',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            ТАБЛИЦА ЛИДЕРОВ
          </h1>
        </div>
        <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#666', letterSpacing: '0.3em', textTransform: 'uppercase', marginLeft: 15 }}>
          ТОП ОПЕРАТИВНИКОВ СЕРВЕРА · ОБНОВЛЯЕТСЯ ЕЖЕДНЕВНО
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 20px',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              border: `1px solid ${tab === t.id ? '#FF2B4F' : '#3A1017'}`,
              background: tab === t.id ? '#FF2B4F18' : '#0e0e0e',
              color: tab === t.id ? '#FF2B4F' : '#666',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Podium top-3 */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[top3[1], top3[0], top3[2]].map((p, podiumIdx) => {
          if (!p) return null
          const heights = ['80px', '110px', '60px']
          const actualRank = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2
          return (
            <div
              key={p.name}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ fontSize: podiumIdx === 1 ? 28 : 20 }}>{MEDAL[actualRank]}</div>
              {/* Avatar orb */}
              <div style={{
                width: podiumIdx === 1 ? 56 : 44, height: podiumIdx === 1 ? 56 : 44,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 35%, ${p.color}cc, ${p.color}66)`,
                boxShadow: `0 0 ${podiumIdx === 1 ? '20px' : '12px'} ${p.color}60`,
                border: `2px solid ${MEDAL_COLOR[actualRank]}`,
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700,
                color: podiumIdx === 1 ? '#fff' : '#ccc',
                textAlign: 'center',
              }}>{p.name}</span>
              {/* Pedestal */}
              <div style={{
                width: '100%', height: heights[podiumIdx],
                background: `linear-gradient(to top, ${MEDAL_COLOR[actualRank]}22, ${MEDAL_COLOR[actualRank]}08)`,
                border: `1px solid ${MEDAL_COLOR[actualRank]}40`,
                borderBottom: `2px solid ${MEDAL_COLOR[actualRank]}80`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                clipPath: 'polygon(0 8px, 8px 0, 100% 0, 100% 100%, 0 100%)',
              }}>
                <span style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: podiumIdx === 1 ? 28 : 22,
                  color: MEDAL_COLOR[actualRank],
                  letterSpacing: '0.05em',
                }}>
                  {tab === 'kills' ? p.kills : tab === 'time' ? p.playtime : p.kd}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #3A1017', borderRadius: 12, overflow: 'hidden', backgroundColor: '#0e0e0e' }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px 70px 80px',
          gap: 0, padding: '10px 16px',
          borderBottom: '1px solid #3A1017',
          backgroundColor: '#0a0000',
        }}>
          {['#', 'ИГРОК', 'УБИЙСТВА', 'СМЕРТИ', 'K/D', 'ВРЕМЯ'].map(col => (
            <span key={col} style={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
              color: '#3A1017', letterSpacing: '0.35em', textTransform: 'uppercase',
            }}>{col}</span>
          ))}
        </div>

        {list.map((p, i) => {
          const isTop = i < 3
          return (
            <div
              key={p.name}
              style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px 70px 80px',
                gap: 0, padding: '12px 16px',
                borderBottom: i < list.length - 1 ? '1px solid #1a0808' : 'none',
                background: i === 0 ? 'linear-gradient(90deg, #FF2B4F10, transparent)' : 'transparent',
                transition: 'background 0.15s',
                alignItems: 'center',
              }}
              onMouseEnter={e => { if (i > 0) (e.currentTarget as HTMLElement).style.background = '#1a0808' }}
              onMouseLeave={e => { if (i > 0) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {/* Rank # */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 18,
                color: isTop ? MEDAL_COLOR[i] : '#3A1017',
                letterSpacing: '0.05em',
              }}>
                {i < 3 ? ['I', 'II', 'III'][i] : i + 1}
              </span>

              {/* Name + avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: `radial-gradient(circle at 35% 35%, ${p.color}cc, ${p.color}55)`,
                  boxShadow: isTop ? `0 0 8px ${p.color}50` : 'none',
                }} />
                <span style={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                  fontWeight: 700,
                  color: i === 0 ? '#FF2B4F' : '#ccc',
                }}>{p.name}</span>
              </div>

              {/* Kills */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 20,
                color: tab === 'kills' ? '#fff' : '#555',
                letterSpacing: '0.05em',
              }}>{p.kills.toLocaleString()}</span>

              {/* Deaths */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 20,
                color: '#444', letterSpacing: '0.05em',
              }}>{p.deaths.toLocaleString()}</span>

              {/* KD */}
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 20,
                color: tab === 'kd' ? '#fff' : '#555',
                letterSpacing: '0.05em',
              }}>{p.kd.toFixed(2)}</span>

              {/* Playtime */}
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                color: tab === 'time' ? '#FF2B4F' : '#555',
              }}>{p.playtime}</span>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#3A1017', letterSpacing: '0.4em', textTransform: 'uppercase',
        }}>
          ДАННЫЕ ОБНОВЛЯЮТСЯ РАЗ В 24 ЧАСА · MOCK DATA
        </span>
      </div>
    </div>
  )
}
