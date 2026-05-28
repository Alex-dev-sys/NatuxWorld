import { products } from '@/lib/products'
import Link from 'next/link'

export const metadata = {
  title: 'Сравнение рангов — NATUX WORLD',
}

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

export default function ComparePage() {
  const sorted = products.filter(p => p.active).sort((a, b) => a.order - b.order)

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="font-pixel text-xs md:text-sm text-site-accent text-center mb-2">
        СРАВНЕНИЕ РАНГОВ
      </h1>
      <p className="text-site-muted text-sm text-center mb-8">
        Все {sorted.length} ранга в одной таблице
      </p>

      <div className="overflow-x-auto rounded-lg border border-site-border">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="border-b border-site-border">
              <th className="text-left px-4 py-3 text-site-muted uppercase tracking-wider font-medium bg-site-block sticky left-0 z-10 min-w-[140px]">
                Параметр
              </th>
              {sorted.map(p => (
                <th key={p.id} className="px-3 py-3 text-center bg-site-block min-w-[90px]">
                  <div className="flex flex-col items-center gap-1">
                    {p.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: p.color, color: '#000' }}>
                        {p.badge}
                      </span>
                    )}
                    <span className="font-pixel text-[10px]" style={{ color: p.color }}>{p.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Prices row */}
            <tr className="border-b border-site-border/50">
              <td className="px-4 py-3 text-site-muted bg-site-block sticky left-0 font-medium">
                Цена / мес
              </td>
              {sorted.map(p => (
                <td key={p.id} className="px-3 py-3 text-center text-site-text font-semibold">
                  {p.variants[0].price}₽
                </td>
              ))}
            </tr>
            <tr className="border-b border-site-border/50 bg-site-secondary/20">
              <td className="px-4 py-3 text-site-muted bg-site-block sticky left-0 font-medium">
                Навсегда
              </td>
              {sorted.map(p => (
                <td key={p.id} className="px-3 py-3 text-center text-site-accent font-bold">
                  {p.variants[2].price}₽
                </td>
              ))}
            </tr>

            {/* Feature rows */}
            {KEY_PERKS.map((perk, i) => (
              <tr key={perk.label} className={`border-b border-site-border/30 ${i % 2 === 0 ? '' : 'bg-site-secondary/10'}`}>
                <td className="px-4 py-2.5 text-site-muted bg-site-block sticky left-0">{perk.label}</td>
                {sorted.map(p => {
                  const val = perk.fn(p.perks)
                  return (
                    <td key={p.id} className="px-3 py-2.5 text-center">
                      <span className={val === '✓' ? 'text-site-success' : val === '—' ? 'text-site-border' : 'text-site-text'}>
                        {val}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Buy row */}
            <tr>
              <td className="px-4 py-3 bg-site-block sticky left-0" />
              {sorted.map(p => (
                <td key={p.id} className="px-3 py-3 text-center">
                  <Link
                    href="/shop"
                    className="inline-block px-3 py-1.5 text-xs font-semibold rounded transition-colors hover:opacity-80"
                    style={{ backgroundColor: p.color, color: '#000' }}
                  >
                    Купить
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
