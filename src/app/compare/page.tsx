import { getActiveProducts } from '@/lib/productStore'
import Link from 'next/link'

export const metadata = {
  title: 'Сравнение рангов — NATUX WORLD',
}

export const dynamic = 'force-dynamic'

const KEY_PERKS = [
  { label: 'Приват', fn: (p: string[]) => p.find(x => x.includes('Приват'))?.match(/\d+|лимит/i)?.[0] ?? '—' },
  { label: 'Кит', fn: (p: string[]) => { const m = p.find(x => x.match(/kit.*раз/i))?.match(/раз в (.+)/i)?.[1]; return m ?? '—' } },
  { label: '/fly выживание', fn: (p: string[]) => p.some(x => x.includes('/fly на выживании') || x.includes('/fly везде')) ? '✓' : '—' },
  { label: '/heal', fn: (p: string[]) => p.some(x => x.includes('/heal')) ? '✓' : '—' },
  { label: '/feed', fn: (p: string[]) => p.some(x => x.includes('/feed')) ? '✓' : '—' },
  { label: '/god', fn: (p: string[]) => p.some(x => x.includes('/god')) ? '✓' : '—' },
  { label: '/vanish', fn: (p: string[]) => p.some(x => x.includes('/vanish')) ? '✓' : '—' },
  { label: 'Сохранение инвентаря', fn: (p: string[]) => p.some(x => x.includes('Сохранение инвентаря')) ? '✓' : '—' },
  { label: 'Опыт с мобов', fn: (p: string[]) => p.find(x => x.match(/x\d|опыт/i))?.match(/x[\d.]+/i)?.[0] ?? '—' },
  { label: 'Discord-канал', fn: (p: string[]) => p.some(x => x.includes('Discord')) ? '✓' : '—' },
]

const TH_BASE = 'px-3 py-3 text-center min-w-[96px]'
const STICKY_LABEL = 'sticky left-0 z-10 px-4 py-2.5 text-left min-w-[150px]'

function CellValue({ val }: { val: string }) {
  if (val === '✓') {
    return <span style={{ color: '#35C759', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>✓</span>
  }
  if (val === '—') {
    return <span style={{ color: '#3A1017', fontFamily: '"JetBrains Mono", monospace' }}>—</span>
  }
  return <span style={{ color: '#fff', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
}

export default async function ComparePage() {
  const sorted = await getActiveProducts()

  return (
    <div className="cmp-root max-w-7xl mx-auto px-4 py-12">
      <style>{`
        .cmp-table { border-collapse: separate; border-spacing: 0; }
        .cmp-table tbody tr { transition: background 0.14s ease; }
        .cmp-table tbody tr:hover td { background: #160a0c !important; }
        .cmp-buy { transition: all 0.16s ease; }
        .cmp-buy:hover { filter: brightness(1.12); box-shadow: 0 0 14px -2px var(--cmp-glow); }
      `}</style>

      {/* Header */}
      <div className="mb-7 animate-fade-in-up">
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#FF2B4F', letterSpacing: '0.4em', marginBottom: 10 }}>
          {'// СПЕЦИФИКАЦИЯ ДОПУСКОВ'}
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 30, backgroundColor: '#FF2B4F' }} className="glow-red" />
          <h1 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(38px, 8vw, 68px)',
            letterSpacing: '0.06em',
            lineHeight: 0.95,
            color: '#fff',
          }}>
            СРАВНЕНИЕ РАНГОВ
          </h1>
        </div>
        <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#888', letterSpacing: '0.25em', textTransform: 'uppercase', marginLeft: 15 }}>
          {'>'} ВСЕ {sorted.length} РАНГА В ОДНОЙ МАТРИЦЕ ДОПУСКОВ
        </p>
      </div>

      {/* Spec matrix */}
      <div className="scanline clip-angle" style={{ border: '1px solid #3A1017', overflowX: 'auto', background: '#130a0b' }}>
        <table className="cmp-table w-full">
          <thead>
            {/* 3D voxel bust row — one spinning emblem per rank column */}
            <tr>
              <th
                className={STICKY_LABEL}
                style={{ background: '#0a0405', padding: '0 0 4px', verticalAlign: 'bottom' }}
                aria-hidden="true"
              />
            </tr>
            <tr>
              <th className={STICKY_LABEL} style={{ background: '#0a0405', borderBottom: '1px solid #3A1017' }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#7a3540', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
                  ПАРАМЕТР
                </span>
              </th>
              {sorted.map(p => (
                <th key={p.id} className={TH_BASE} style={{ background: '#0a0405', borderBottom: `2px solid ${p.color}`, borderLeft: '1px solid #160808' }}>
                  <div className="flex flex-col items-center gap-1.5">
                    <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 15, letterSpacing: '0.05em', color: p.color }}>
                      {p.name}
                    </span>
                    {p.badge && (
                      <span style={{
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 7,
                        letterSpacing: '0.18em', padding: '2px 6px',
                        color: p.color, border: `1px solid ${p.color}66`,
                      }}>
                        {p.badge}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Price / month */}
            <tr>
              <td className={STICKY_LABEL} style={{ background: '#0c0607', borderBottom: '1px solid #160808' }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#B8B8B8', letterSpacing: '0.08em' }}>{'// ЦЕНА / МЕС'}</span>
              </td>
              {sorted.map(p => (
                <td key={p.id} className="px-3 py-3 text-center" style={{ borderBottom: '1px solid #160808', borderLeft: '1px solid #160808' }}>
                  <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#fff', letterSpacing: '0.03em', fontVariantNumeric: 'tabular-nums' }}>
                    {p.variants[0].price}
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#666' }}>₽</span>
                </td>
              ))}
            </tr>

            {/* Forever */}
            <tr>
              <td className={STICKY_LABEL} style={{ background: '#0c0607', borderBottom: '1px solid #160808' }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#B8B8B8', letterSpacing: '0.08em' }}>{'// НАВСЕГДА'}</span>
              </td>
              {sorted.map(p => (
                <td key={p.id} className="px-3 py-3 text-center" style={{ borderBottom: '1px solid #160808', borderLeft: '1px solid #160808', background: 'rgba(255,43,79,0.04)' }}>
                  <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#FF2B4F', letterSpacing: '0.03em', fontVariantNumeric: 'tabular-nums' }} className="text-glow-red">
                    {p.variants[2].price}
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#7a3540' }}>₽</span>
                </td>
              ))}
            </tr>

            {/* Feature rows */}
            {KEY_PERKS.map((perk, i) => (
              <tr key={perk.label}>
                <td className={STICKY_LABEL} style={{ background: i % 2 === 0 ? '#130a0b' : '#0b0506', borderBottom: '1px solid #120606' }}>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#B8B8B8', letterSpacing: '0.05em' }}>{perk.label}</span>
                </td>
                {sorted.map(p => (
                  <td key={p.id} className="px-3 py-2.5 text-center" style={{
                    borderBottom: '1px solid #120606',
                    borderLeft: '1px solid #120606',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)',
                  }}>
                    <CellValue val={perk.fn(p.perks)} />
                  </td>
                ))}
              </tr>
            ))}

            {/* Buy row */}
            <tr>
              <td className={STICKY_LABEL} style={{ background: '#0a0405' }} />
              {sorted.map(p => (
                <td key={p.id} className="px-3 py-4 text-center" style={{ borderLeft: '1px solid #160808', background: '#0a0405' }}>
                  <Link
                    href="/shop"
                    className="cmp-buy clip-angle-sm inline-block"
                    style={{
                      ['--cmp-glow' as string]: p.color,
                      padding: '8px 16px',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 9,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: p.color,
                      border: `1px solid ${p.color}88`,
                      background: `${p.color}14`,
                    }}
                  >
                    {'>'} КУПИТЬ
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 16 }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#7a3540', letterSpacing: '0.3em', textTransform: 'uppercase',
        }}>
          {'// ✓ ДОСТУП ОТКРЫТ · — ДОСТУП ЗАКРЫТ'}
        </span>
      </div>
    </div>
  )
}
