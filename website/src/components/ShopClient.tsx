'use client'

import { useState, useEffect, useRef } from 'react'
import RankEmblem from './RankEmblem'
import RankAura from './RankAura'
import RankFrame from './RankFrame'
import { PremiumCard, useCountUp } from './PremiumFX'
import { useRouter } from 'next/navigation'
import type { Product, Duration, ProductVariant, Coupon } from '@/lib/types'

// ─── validation ──────────────────────────────────────────────────────────────

function validateUsername(nick: string): string | null {
  if (!nick) return 'Введите Minecraft ник'
  if (nick.length < 3) return 'Минимум 3 символа'
  if (nick.length > 16) return 'Максимум 16 символов'
  if (!/^[a-zA-Z0-9_]+$/.test(nick)) return 'Только латиница, цифры и _'
  return null
}

// Тёмный/светлый текст в зависимости от яркости фона (контраст на кнопке).
function readableText(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0A0608' : '#ffffff'
}

// Осветлить/затемнить hex-цвет (f<0 темнее, f>0 светлее).
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => {
    const m = f < 0 ? v * (1 + f) : v + (255 - v) * f
    return Math.round(Math.min(255, Math.max(0, m)))
  }
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// ─── rank carousel ────────────────────────────────────────────────────────────

function RankCarousel({ products, selectedId, onSelect }: {
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

// ─── duration button ──────────────────────────────────────────────────────────

function DurationButton({ variant, active, saving, color, onClick }: {
  variant: ProductVariant
  active: boolean
  saving?: number
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2.5 px-2 text-sm transition-all relative"
      style={{
        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
        border: `1px solid ${active ? color : '#2a1010'}`,
        background: active ? `linear-gradient(160deg, ${color}22 0%, #130a0b 100%)` : '#111',
        boxShadow: active ? `0 0 14px ${color}33, inset 0 0 12px ${color}10` : 'none',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = `${color}66` }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = '#2a1010' }}
    >
      <div className="text-center leading-snug">
        <div className="font-medium" style={{ color: active ? '#fff' : '#aaa' }}>{variant.durationLabel}</div>
        <div className="text-xs mt-0.5 font-bold" style={{ color: active ? color : '#888' }}>
          {variant.price} ₽
        </div>
      </div>
    </button>
  )
}

// ─── promo code ───────────────────────────────────────────────────────────────

// Активная акция (из env) — подсказка под полем ввода.
const SALE_CODE = process.env.NEXT_PUBLIC_SALE_CODE ?? ''
const SALE_DISCOUNT = process.env.NEXT_PUBLIC_SALE_DISCOUNT ?? ''

function PromoCodeField({ onApply, onRemove, applied }: {
  onApply: (c: Coupon) => void
  onRemove: () => void
  applied: Coupon | null
}) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = async (codeArg?: string) => {
    const code = (codeArg ?? value).trim()
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Неверный промокод')
        return
      }
      onApply(data as Coupon)
      setValue('')
    } catch {
      setError('Ошибка проверки')
    } finally {
      setLoading(false)
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between bg-site-success/10 border border-site-success/30 rounded px-3 py-2">
        <div>
          <span className="text-site-success text-sm font-semibold">{applied.code}</span>
          <span className="text-site-muted text-xs ml-2">{applied.description}</span>
        </div>
        <button onClick={onRemove} className="text-site-muted hover:text-site-danger transition-colors text-xs">
          Убрать
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value.toUpperCase()); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="Промокод"
          className="flex-1 bg-site-bg border border-site-border focus:border-site-accent rounded px-3 py-2 text-site-text text-sm placeholder-site-muted/40 focus:outline-none transition-colors uppercase"
        />
        <button
          onClick={() => check()}
          disabled={loading || !value.trim()}
          className="px-4 py-2 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded text-sm transition-colors disabled:opacity-40"
        >
          {loading ? '...' : 'Применить'}
        </button>
      </div>
      {error && <p className="mt-1 text-site-danger text-xs">{error}</p>}
      {/* подсказка с активным промокодом — клик подставляет и применяет */}
      {SALE_CODE && !error && (
        <button
          type="button"
          onClick={() => { setValue(SALE_CODE); check(SALE_CODE) }}
          disabled={loading}
          className="group mt-1.5 flex items-center gap-1.5 text-left disabled:opacity-50"
          title="Нажми, чтобы применить промокод"
        >
          <span className="text-[11px] text-site-muted tracking-wide">
            Активный промокод:
          </span>
          <span className="text-[11px] font-bold text-site-accent tracking-[0.15em] group-hover:underline underline-offset-2">
            {SALE_CODE}
          </span>
          {SALE_DISCOUNT && (
            <span className="text-[10px] font-bold text-site-success">{SALE_DISCOUNT}</span>
          )}
          <span className="text-[9px] text-site-muted/60 group-hover:text-site-accent transition-colors">— нажми, чтобы применить</span>
        </button>
      )}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ShopClient({ products }: { products: Product[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [selectedDuration, setSelectedDuration] = useState<Duration>('30d')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [coupon, setCoupon] = useState<Coupon | null>(null)
  const [loading, setLoading] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'TON' | 'USDT'>('card')
  const [rates, setRates] = useState<{ ton: number; usdt: number } | null>(null)

  // Fetch live crypto rates on mount and refresh every 5 minutes.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/rates')
        if (!res.ok) return
        const data = (await res.json()) as { ton: number; usdt: number }
        if (!cancelled) setRates({ ton: data.ton, usdt: data.usdt })
      } catch {
        // ignore — conversion is informational only
      }
    }
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const product = products.find(p => p.id === selectedId) ?? products[0]
  const variant = product?.variants.find(v => v.duration === selectedDuration) ?? product?.variants[0]

  const basePrice = variant?.price ?? 0
  const discountedPrice = coupon
    ? coupon.type === 'percent'
      ? Math.max(1, Math.round(basePrice * (1 - coupon.value / 100)))
      : Math.max(1, basePrice - coupon.value)
    : basePrice

  // Live crypto conversion (informational), 2 decimals, 0.01 minimum.
  const cryptoAmount =
    paymentMethod !== 'card' && rates
      ? Math.max(
          0.01,
          discountedPrice / (paymentMethod === 'USDT' ? rates.usdt : rates.ton)
        ).toFixed(2)
      : null

  // Savings vs buying 3× or 12× the 30d variant
  function getSaving(v: ProductVariant): number {
    const base30 = product?.variants.find(x => x.duration === '30d')?.price ?? 0
    if (v.duration === '90d') return Math.max(0, base30 * 3 - v.price)
    if (v.duration === 'forever') return Math.max(0, base30 * 12 - v.price)
    return 0
  }

  const handleUsernameChange = (v: string) => {
    setUsername(v)
    if (usernameError) setUsernameError(validateUsername(v))
  }

  const handleBuy = async () => {
    const err = validateUsername(username)
    if (err) { setUsernameError(err); return }

    setLoading(true)
    setOrderError(null)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          duration: selectedDuration,
          username: username.trim(),
          couponCode: coupon?.code,
          paymentMethod,
          // asset only relevant for crypto; omitted for card so backend uses YooKassa
          ...(paymentMethod === 'card' ? {} : { asset: paymentMethod }),
        }),
      })

      const data = await res.json()
      if (!res.ok) { setOrderError(data.error ?? 'Ошибка создания заказа'); return }
      // если сервер вернул внешний URL (криптоплатёж) — редирект туда
      if (data.paymentUrl && !data.paymentUrl.includes('/pay/')) {
        window.location.href = data.paymentUrl
      } else {
        router.push(`/pay/${data.publicId}`)
      }
    } catch {
      setOrderError('Ошибка соединения с сервером')
    } finally {
      setLoading(false)
    }
  }

  // Премиальный «одометр» — числа плавно прокручиваются при смене ранга/срока.
  const displayPrice = useCountUp(discountedPrice)
  const displayBase = useCountUp(basePrice)

  if (!product || !variant) return null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="font-pixel text-xs md:text-sm text-site-accent">МАГАЗИН ПРИВИЛЕГИЙ</h1>
      </div>

      {/* ── Rank carousel ── */}
      <div className="border border-site-border mb-6 overflow-hidden" style={{ backgroundColor: '#140a0b', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}>
        <div className="flex items-center gap-3 px-6 pt-4 pb-0">
          <div style={{ width: 3, height: 14, backgroundColor: '#FF2B4F', flexShrink: 0 }} />
          <p
            className="text-[10px] uppercase tracking-[0.4em]"
            style={{ color: '#666', fontFamily: '"JetBrains Mono", monospace' }}
          >
            Выберите ранг
          </p>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #3A1017, transparent)' }} />
        </div>
        <RankCarousel
          products={products}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setSelectedDuration('30d'); setCoupon(null) }}
        />
      </div>

      {/* ── Rank details (досье ранга) ── */}
      <PremiumCard
        color={product.color}
        tilt={0}
        className="relative overflow-hidden crt-grain p-5 sm:p-7"
        style={{
          background: `linear-gradient(165deg, ${product.color}12 0%, #0b0b0b 42%)`,
          border: `1px solid ${product.color}33`,
          clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))',
          boxShadow: `0 0 50px -14px ${product.color}66, inset 0 1px 0 ${product.color}22`,
        }}
      >
        {/* верхняя акцентная кромка */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: 2, background: `linear-gradient(90deg, transparent, ${product.color}, transparent)` }}
        />
        {/* угловые скобки */}
        <div className="absolute top-2.5 left-2.5 w-4 h-4 pointer-events-none" style={{ borderLeft: `2px solid ${product.color}66`, borderTop: `2px solid ${product.color}66` }} />
        <div className="absolute bottom-2.5 right-2.5 w-4 h-4 pointer-events-none" style={{ borderRight: `2px solid ${product.color}66`, borderBottom: `2px solid ${product.color}66` }} />
        {/* код допуска */}
        <div
          className="absolute top-3 right-5 text-[9px] tracking-[0.3em] hidden sm:block"
          style={{ fontFamily: '"JetBrains Mono", monospace', color: `${product.color}aa` }}
        >
          ДОПУСК {String(product.order).padStart(2, '0')} / 15
        </div>

        {/* Шапка ранга */}
        <div className="flex items-center gap-3 mb-2 relative">
          <div style={{ filter: `drop-shadow(0 0 12px ${product.color}99)`, flexShrink: 0, position: 'relative' }}>
            <RankAura rank={product.id} size={44} />
            <RankEmblem rank={product.id} color={product.color} size={44} />
          </div>
          <div className="flex flex-col">
            <h2
              className="font-display text-3xl md:text-4xl leading-none"
              style={{ fontFamily: '"Bebas Neue", sans-serif', color: product.color, letterSpacing: '0.06em', textShadow: `0 0 24px ${product.color}55` }}
            >
              {product.name}
            </h2>
            {product.badge && (
              <span
                className="mt-1.5 self-start text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider"
                style={{
                  backgroundColor: product.color,
                  color: readableText(product.color),
                  clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))',
                }}
              >
                {product.badge}
              </span>
            )}
          </div>
        </div>
        <p className="text-site-muted text-sm mb-6 leading-relaxed">{product.description}</p>

        {/* Срок допуска */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div style={{ width: 3, height: 12, background: product.color }} />
            <p className="text-[10px] uppercase tracking-[0.35em]" style={{ fontFamily: '"JetBrains Mono", monospace', color: `${product.color}cc` }}>
              Срок допуска
            </p>
          </div>
          <div className="flex gap-2">
            {product.variants.map(v => (
              <DurationButton
                key={v.duration}
                variant={v}
                color={product.color}
                active={v.duration === selectedDuration}
                saving={getSaving(v)}
                onClick={() => setSelectedDuration(v.duration)}
              />
            ))}
          </div>
        </div>

        {/* Привилегии */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div style={{ width: 3, height: 12, background: product.color }} />
            <p className="text-[10px] uppercase tracking-[0.35em]" style={{ fontFamily: '"JetBrains Mono", monospace', color: `${product.color}cc` }}>
              Привилегии — {product.perks.length}
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-0.5">
            {product.perks.map(perk => (
              <li key={perk} className="flex items-start gap-2.5 text-sm leading-snug py-1 group">
                <span
                  className="flex-shrink-0"
                  style={{ marginTop: 6, width: 5, height: 5, background: product.color, transform: 'rotate(45deg)', boxShadow: `0 0 5px ${product.color}99` }}
                />
                <span className="text-site-muted group-hover:text-site-text transition-colors">{perk}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Minecraft ник */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 3, height: 12, background: product.color }} />
            <p className="text-[10px] uppercase tracking-[0.35em]" style={{ fontFamily: '"JetBrains Mono", monospace', color: `${product.color}cc` }}>
              Minecraft ник
            </p>
          </div>
          <input
            type="text"
            value={username}
            onChange={e => handleUsernameChange(e.target.value)}
            onBlur={e => { setUsernameError(validateUsername(username)); e.currentTarget.style.borderColor = usernameError ? '#FF3B30' : '#2a1010' }}
            onFocus={e => { if (!usernameError) e.currentTarget.style.borderColor = product.color }}
            placeholder="Введите ник (например: Notch)"
            maxLength={16}
            className="w-full bg-site-bg px-4 py-3 text-site-text placeholder-site-muted/40 focus:outline-none transition-colors"
            style={{
              border: `1px solid ${usernameError ? '#FF3B30' : '#2a1010'}`,
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            }}
          />
          {usernameError
            ? <p className="mt-1 text-site-danger text-xs">{usernameError}</p>
            : <p className="mt-1 text-site-muted text-xs">Проверь ник — после оплаты изменить нельзя</p>
          }
        </div>

        {/* Промокод */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 3, height: 12, background: product.color }} />
            <p className="text-[10px] uppercase tracking-[0.35em]" style={{ fontFamily: '"JetBrains Mono", monospace', color: `${product.color}cc` }}>
              Промокод
            </p>
          </div>
          <PromoCodeField
            applied={coupon}
            onApply={setCoupon}
            onRemove={() => setCoupon(null)}
          />
        </div>

        {/* Цена + покупка */}
        <div className="flex flex-col gap-4 pt-5" style={{ borderTop: `1px solid ${product.color}26` }}>

          {/* Способ оплаты */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-site-muted text-xs uppercase tracking-wider">Оплата:</span>
            {([
              { id: 'card', label: 'Карта / СБП' },
              { id: 'TON', label: 'TON' },
              { id: 'USDT', label: 'USDT' },
            ] as const).map(m => {
              const on = paymentMethod === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className="px-3 py-1 text-xs font-bold transition-all"
                  style={{
                    clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))',
                    border: `1px solid ${on ? product.color : '#2a1010'}`,
                    background: on ? `${product.color}22` : 'transparent',
                    color: on ? product.color : '#888',
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] mb-1" style={{ fontFamily: '"JetBrains Mono", monospace', color: '#888' }}>К оплате</p>
              {coupon ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-4xl type-data" style={{ fontFamily: '"Bebas Neue", sans-serif', color: '#fff', letterSpacing: '0.02em' }}>{displayPrice} ₽</span>
                  <span className="text-site-muted text-sm line-through type-data">{displayBase} ₽</span>
                  <span className="text-site-success text-xs font-semibold">
                    −{coupon.type === 'percent' ? `${coupon.value}%` : `${basePrice - discountedPrice}₽`}
                  </span>
                </div>
              ) : (
                <span className="font-display text-4xl type-data" style={{ fontFamily: '"Bebas Neue", sans-serif', color: '#fff', letterSpacing: '0.02em' }}>{displayBase} ₽</span>
              )}
              {paymentMethod !== 'card' && cryptoAmount && (
                <p className="text-site-muted text-xs mt-1">≈ {cryptoAmount} {paymentMethod}</p>
              )}
              {paymentMethod === 'card' && (
                <p className="text-site-muted text-xs mt-1">Карта · СБП</p>
              )}
            </div>

            <button
              onClick={handleBuy}
              disabled={loading || !username}
              className="group holo-sheen relative w-full sm:w-auto px-9 py-3.5 font-bold transition-all flex items-center justify-center gap-2 overflow-hidden"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.16em', fontSize: 17,
                background: (!username || loading) ? '#1a0e0f' : `linear-gradient(135deg, ${shade(product.color, 0.12)}, ${shade(product.color, -0.28)})`,
                color: (!username || loading) ? '#666' : readableText(product.color),
                cursor: (!username || loading) ? 'not-allowed' : 'pointer',
                boxShadow: (!username || loading) ? 'none' : `0 0 26px -4px ${product.color}aa`,
              }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Создаём заказ...
                </>
              ) : (
                <>
                  <span className="relative z-10">Получить допуск →</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </>
              )}
            </button>
          </div>
        </div>

        {orderError && (
          <div className="mt-4 p-3 bg-site-danger/10 border border-site-danger/30 text-site-danger text-sm">
            {orderError}
          </div>
        )}
      </PremiumCard>
    </div>
  )
}
