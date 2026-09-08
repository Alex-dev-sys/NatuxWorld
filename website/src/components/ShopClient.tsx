'use client'

import { useState, useEffect } from 'react'
import RankEmblem from './RankEmblem'
import RankAura from './RankAura'
import RankCarousel from './shop/RankCarousel'
import DurationButton from './shop/DurationButton'
import PromoCodeField from './shop/PromoCodeField'
import { PremiumCard, useCountUp } from './PremiumFX'
import { useRouter } from 'next/navigation'
import type { Product, Duration, ProductVariant, Coupon } from '@/lib/types'
import { applyDiscount, isFree } from '@/lib/coupons'

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
  // Same pure function the server uses, so the price shown always matches the
  // price charged. The inlined copy did not know about `free` coupons and left
  // the full price on screen for an activation that actually costs 0 ₽.
  const discountedPrice = coupon ? applyDiscount(basePrice, coupon) : basePrice

  // Live crypto conversion (informational), 2 decimals, 0.01 minimum.
  // A free activation is not paid in crypto at all — the 0.01 floor otherwise
  // showed an amount next to a 0 ₽ total.
  const cryptoAmount =
    paymentMethod !== 'card' && rates && discountedPrice > 0
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
                    {isFree(coupon)
                      ? 'бесплатно'
                      : `−${coupon.type === 'percent' ? `${coupon.value}%` : `${basePrice - discountedPrice}₽`}`}
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
