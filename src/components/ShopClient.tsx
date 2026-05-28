'use client'

import { useState, useEffect, useRef } from 'react'
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

// ─── recent purchases ticker ──────────────────────────────────────────────────

const RECENT: { nick: string; rank: string; duration: string }[] = [
  { nick: 'DarkSword228', rank: 'Elite', duration: 'навсегда' },
  { nick: 'xX_Notch_Xx', rank: 'Hero', duration: '30 дней' },
  { nick: 'PvPmaster99', rank: 'Squid', duration: '90 дней' },
  { nick: 'IronForge', rank: 'Head', duration: 'навсегда' },
  { nick: 'StarlightGG', rank: 'Aspid', duration: '30 дней' },
  { nick: 'ZombieSlayer', rank: 'Guard', duration: 'навсегда' },
  { nick: 'NightRaider', rank: 'Elite', duration: '90 дней' },
  { nick: 'CreeperKing', rank: 'Hero', duration: 'навсегда' },
  { nick: 'DiamondBlade', rank: 'Squid', duration: '30 дней' },
  { nick: 'VoidWalker', rank: 'Aspid', duration: 'навсегда' },
]

function RecentPurchasesTicker() {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % RECENT.length)
        setVisible(true)
      }, 400)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const item = RECENT[idx]
  const ago = Math.floor(Math.random() * 12) + 1

  return (
    <div className="flex items-center gap-2 text-xs text-site-muted overflow-hidden">
      <span className="w-1.5 h-1.5 rounded-full bg-site-success flex-shrink-0 animate-pulse" />
      <span
        className="transition-opacity duration-300 whitespace-nowrap"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span className="text-site-text font-mono">{item.nick}</span>
        {' купил '}
        <span className="text-site-accent font-semibold">{item.rank}</span>
        {' '}
        <span>{item.duration}</span>
        {' — '}
        <span>{ago} мин. назад</span>
      </span>
    </div>
  )
}

// ─── rank card ────────────────────────────────────────────────────────────────

function RankCard({ product, active, onClick }: {
  product: Product
  active: boolean
  onClick: () => void
}) {
  const minPrice = Math.min(...product.variants.map(v => v.price))

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-lg border transition-all relative ${
        active
          ? 'border-site-accent bg-site-secondary glow-red'
          : 'border-site-border bg-site-block hover:border-site-accent/50'
      }`}
    >
      {product.badge && (
        <span
          className="absolute -top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded"
          style={{ backgroundColor: product.color, color: '#000' }}
        >
          {product.badge}
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: product.color,
              boxShadow: active ? `0 0 8px ${product.color}` : 'none',
            }}
          />
          <span
            className="font-semibold text-sm"
            style={{ color: active ? product.color : '#F2F2F2' }}
          >
            {product.name}
          </span>
        </div>
        <span className="text-site-muted text-xs">от {minPrice}₽</span>
      </div>
    </button>
  )
}

// ─── duration button ──────────────────────────────────────────────────────────

function DurationButton({ variant, active, saving, onClick }: {
  variant: ProductVariant
  active: boolean
  saving?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 px-2 rounded border text-sm transition-all relative ${
        active
          ? 'border-site-accent bg-site-secondary text-site-accent'
          : 'border-site-border bg-site-block text-site-muted hover:border-site-accent/40 hover:text-site-text'
      }`}
    >
      {saving && saving > 0 ? (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-site-success text-black text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
          −{saving}₽
        </div>
      ) : null}
      <div className="text-center leading-snug">
        <div className="font-medium">{variant.durationLabel}</div>
        <div className={`text-xs mt-0.5 font-bold ${active ? 'text-site-accent' : 'text-site-muted'}`}>
          {variant.price} ₽
        </div>
      </div>
    </button>
  )
}

// ─── promo code ───────────────────────────────────────────────────────────────

function PromoCodeField({ onApply, onRemove, applied }: {
  onApply: (c: Coupon) => void
  onRemove: () => void
  applied: Coupon | null
}) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = async () => {
    if (!value.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(value.trim())}`)
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
          onClick={check}
          disabled={loading || !value.trim()}
          className="px-4 py-2 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded text-sm transition-colors disabled:opacity-40"
        >
          {loading ? '...' : 'Применить'}
        </button>
      </div>
      {error && <p className="mt-1 text-site-danger text-xs">{error}</p>}
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

  const product = products.find(p => p.id === selectedId) ?? products[0]
  const variant = product?.variants.find(v => v.duration === selectedDuration) ?? product?.variants[0]

  const basePrice = variant?.price ?? 0
  const discountedPrice = coupon
    ? coupon.type === 'percent'
      ? Math.max(1, Math.round(basePrice * (1 - coupon.value / 100)))
      : Math.max(1, basePrice - coupon.value)
    : basePrice

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
        }),
      })

      const data = await res.json()
      if (!res.ok) { setOrderError(data.error ?? 'Ошибка создания заказа'); return }
      router.push(`/order/${data.publicId}`)
    } catch {
      setOrderError('Ошибка соединения с сервером')
    } finally {
      setLoading(false)
    }
  }

  if (!product || !variant) return null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">

      {/* Header + ticker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <h1 className="font-pixel text-xs md:text-sm text-site-accent">МАГАЗИН ПРИВИЛЕГИЙ</h1>
        <RecentPurchasesTicker />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: rank list ── */}
        <div className="lg:col-span-1">
          <div className="bg-site-block border border-site-border rounded-lg p-4 sticky top-20">
            <p className="text-site-muted text-xs uppercase tracking-wider mb-4">Выберите ранг</p>
            <div className="flex flex-col gap-2">
              {products.map(p => (
                <RankCard
                  key={p.id}
                  product={p}
                  active={p.id === selectedId}
                  onClick={() => { setSelectedId(p.id); setSelectedDuration('30d'); setCoupon(null) }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: rank details ── */}
        <div className="lg:col-span-2">
          <div className="bg-site-block border border-site-border rounded-lg p-6 relative overflow-hidden">

            {/* Popular glow strip */}
            {product.popular && (
              <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: `linear-gradient(90deg, transparent, ${product.color}, transparent)` }}
              />
            )}

            {/* Rank name */}
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: product.color, boxShadow: `0 0 14px ${product.color}` }}
              />
              <h2
                className="font-pixel text-sm md:text-base"
                style={{ color: product.color }}
              >
                {product.name}
              </h2>
              {product.badge && (
                <span
                  className="px-2 py-0.5 text-[10px] font-bold rounded"
                  style={{ backgroundColor: product.color, color: '#000' }}
                >
                  {product.badge}
                </span>
              )}
            </div>
            <p className="text-site-muted text-sm mb-6 leading-relaxed">{product.description}</p>

            {/* Duration */}
            <div className="mb-6">
              <p className="text-site-muted text-xs uppercase tracking-wider mb-3">Срок действия</p>
              <div className="flex gap-2">
                {product.variants.map(v => (
                  <DurationButton
                    key={v.duration}
                    variant={v}
                    active={v.duration === selectedDuration}
                    saving={getSaving(v)}
                    onClick={() => setSelectedDuration(v.duration)}
                  />
                ))}
              </div>
            </div>

            {/* Perks */}
            <div className="mb-6">
              <p className="text-site-muted text-xs uppercase tracking-wider mb-3">
                Возможности — {product.perks.length} привилегий
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {product.perks.map(perk => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-site-text leading-snug">
                    <svg
                      className="w-3.5 h-3.5 text-site-success mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-site-muted">{perk}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Username */}
            <div className="mb-4">
              <p className="text-site-muted text-xs uppercase tracking-wider mb-2">Minecraft ник</p>
              <input
                type="text"
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                onBlur={() => setUsernameError(validateUsername(username))}
                placeholder="Введите ник (например: Notch)"
                maxLength={16}
                className={`w-full bg-site-bg border rounded px-4 py-3 text-site-text placeholder-site-muted/40 focus:outline-none transition-colors ${
                  usernameError
                    ? 'border-site-danger'
                    : 'border-site-border focus:border-site-accent'
                }`}
              />
              {usernameError
                ? <p className="mt-1 text-site-danger text-xs">{usernameError}</p>
                : <p className="mt-1 text-site-muted text-xs">Проверь ник — после оплаты изменить нельзя</p>
              }
            </div>

            {/* Promo code */}
            <div className="mb-6">
              <p className="text-site-muted text-xs uppercase tracking-wider mb-2">Промокод</p>
              <PromoCodeField
                applied={coupon}
                onApply={setCoupon}
                onRemove={() => setCoupon(null)}
              />
            </div>

            {/* Price + buy */}
            <div className="flex items-center justify-between pt-4 border-t border-site-border">
              <div>
                <p className="text-site-muted text-xs mb-1">К оплате</p>
                {coupon ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-site-text">{discountedPrice} ₽</span>
                    <span className="text-site-muted text-sm line-through">{basePrice} ₽</span>
                    <span className="text-site-success text-xs font-semibold">
                      −{coupon.type === 'percent' ? `${coupon.value}%` : `${basePrice - discountedPrice}₽`}
                    </span>
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-site-text">{basePrice} ₽</span>
                )}
              </div>

              <button
                onClick={handleBuy}
                disabled={loading || !username}
                className={`px-8 py-3 rounded font-bold text-sm transition-all ${
                  !username || loading
                    ? 'bg-site-border text-site-muted cursor-not-allowed'
                    : 'bg-site-accent hover:bg-red-600 text-white glow-red'
                }`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Создаём заказ...
                  </span>
                ) : 'Купить'}
              </button>
            </div>

            {orderError && (
              <div className="mt-4 p-3 bg-site-danger/10 border border-site-danger/30 rounded text-site-danger text-sm">
                {orderError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
