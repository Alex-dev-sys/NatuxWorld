'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product } from '@/lib/types'
import RankEmblem from '../RankEmblem'
import RankAura from '../RankAura'
import RankFrame from '../RankFrame'

// ─── rank carousel ────────────────────────────────────────────────────────────

export default function RankCarousel({ products, selectedId, onSelect }: {
  products: Product[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]') as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedId])

  return (
    <div style={{ backgroundColor: '#140a0b' }}>
      <style>{`
        @keyframes orb-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px var(--c)); transform: scale(1); }
          50%       { filter: drop-shadow(0 0 10px var(--c)) drop-shadow(0 0 22px var(--c-50)); transform: scale(1.08); }
        }
        @keyframes card-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
        @keyframes badge-pulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50%       { opacity: 0.8; transform: translateX(-50%) scale(1.05); }
        }
        @keyframes shimmer-sweep {
          0%   { left: -60%; }
          100% { left: 140%; }
        }
        .rank-card-active { animation: card-float 3s ease-in-out infinite; }
        .rank-orb-active  { animation: orb-pulse 2s ease-in-out infinite; }
        .rank-badge       { animation: badge-pulse 2s ease-in-out infinite; }
        .rank-shimmer     { animation: shimmer-sweep 0.6s ease forwards; }
        .rank-track::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 16px' }}>

        {/* left arrow */}
        <button
          onClick={() => scroll('left')}
          className="hidden md:flex items-center justify-center"
          style={{
            flexShrink: 0, width: 36, height: 56,
            background: 'linear-gradient(135deg, #1a0b0b, #120808)',
            border: '1px solid #3A1017',
            clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            color: '#666', fontSize: 20, cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F'; (e.currentTarget as HTMLElement).style.color = '#FF2B4F' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#666' }}
        >‹</button>

        {/* scroll track */}
        <div
          ref={scrollRef}
          className="rank-track"
          style={{
            display: 'flex', gap: 10, overflowX: 'auto',
            paddingTop: 16, paddingBottom: 8, paddingLeft: 4, paddingRight: 4,
            scrollbarWidth: 'none', flex: 1,
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
          }}
        >
          {products.map(p => {
            const active = p.id === selectedId
            const isHov = hovered === p.id && !active
            const minPrice = Math.min(...p.variants.map(v => v.price))

            return (
              <div key={p.id} style={{ position: 'relative', flexShrink: 0, scrollSnapAlign: 'center' }}>
                {/* badge */}
                {p.badge && (
                  <span
                    className={active ? 'rank-badge' : ''}
                    style={{
                      position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                      zIndex: 10, backgroundColor: p.color, color: '#000',
                      fontSize: 8, fontWeight: 800, padding: '2px 7px',
                      clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                      whiteSpace: 'nowrap', letterSpacing: '0.05em',
                      boxShadow: `0 2px 8px ${p.color}80`,
                    }}
                  >
                    {p.badge}
                  </span>
                )}

                {/* премиальное обрамление активной карточки */}
                {active && <RankFrame rank={p.id} color={p.color} />}

                <button
                  data-active={active}
                  onClick={() => onSelect(p.id)}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={active ? 'rank-card-active' : ''}
                  style={{
                    position: 'relative', zIndex: 1,
                    width: 100, minHeight: 120,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 10, padding: '14px 8px 10px',
                    clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                    border: active
                      ? `1.5px solid ${p.color}`
                      : isHov ? `1px solid ${p.color}60` : '1px solid #2a1010',
                    background: active
                      ? `linear-gradient(160deg, ${p.color}22 0%, #140a0b 100%)`
                      : isHov ? `linear-gradient(160deg, ${p.color}0f 0%, #140a0b 100%)` : '#1a0e0f',
                    boxShadow: active
                      ? `0 0 24px ${p.color}40, inset 0 1px 0 ${p.color}30`
                      : isHov ? `0 0 12px ${p.color}20` : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    transform: isHov ? 'translateY(-2px) scale(1.02)' : undefined,
                    overflow: 'hidden',
                  }}
                >
                  {/* shimmer on hover */}
                  {isHov && (
                    <div
                      className="rank-shimmer"
                      style={{
                        position: 'absolute', top: 0, bottom: 0, width: '50%',
                        background: `linear-gradient(90deg, transparent, ${p.color}15, transparent)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {/* герб ранга */}
                  <div
                    className={active ? 'rank-orb-active' : ''}
                    style={{
                      ['--c' as string]: p.color,
                      ['--c-50' as string]: `${p.color}50`,
                      ['--c-30' as string]: `${p.color}30`,
                      flexShrink: 0,
                      position: 'relative',
                      width: 52, height: 52,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      filter: active
                        ? `drop-shadow(0 0 8px ${p.color})`
                        : isHov ? `drop-shadow(0 0 6px ${p.color}80)` : `drop-shadow(0 0 3px ${p.color}40)`,
                      transition: 'filter 0.2s ease',
                    }}
                  >
                    {(active || isHov) && <RankAura rank={p.id} size={44} />}
                    <RankEmblem rank={p.id} color={p.color} size={44} />
                  </div>

                  {/* name */}
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    color: active ? p.color : isHov ? `${p.color}cc` : '#888',
                    textAlign: 'center', lineHeight: 1.2,
                    letterSpacing: '0.05em',
                    transition: 'color 0.2s ease',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    {p.name}
                  </span>

                  {/* price */}
                  <span style={{
                    fontSize: 10, color: active ? '#ccc' : '#555',
                    fontFamily: '"JetBrains Mono", monospace',
                    transition: 'color 0.2s ease',
                  }}>
                    от {minPrice}₽
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {/* right arrow */}
        <button
          onClick={() => scroll('right')}
          className="hidden md:flex items-center justify-center"
          style={{
            flexShrink: 0, width: 36, height: 56,
            background: 'linear-gradient(135deg, #1a0b0b, #120808)',
            border: '1px solid #3A1017',
            clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            color: '#666', fontSize: 20, cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F'; (e.currentTarget as HTMLElement).style.color = '#FF2B4F' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#666' }}
        >›</button>
      </div>

      {/* dots — mobile only */}
      <div className="flex md:hidden justify-center gap-1.5 pb-4">
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              width: p.id === selectedId ? 18 : 6,
              height: 6, borderRadius: 3, border: 'none',
              cursor: 'pointer', transition: 'all 0.25s ease',
              backgroundColor: p.id === selectedId ? p.color : '#2a1010',
              boxShadow: p.id === selectedId ? `0 0 6px ${p.color}80` : 'none',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
