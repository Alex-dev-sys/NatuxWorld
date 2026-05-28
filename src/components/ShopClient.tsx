'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Product, Duration, ProductVariant } from '@/lib/types'

function validateUsername(nick: string): string | null {
  if (!nick) return 'Введите Minecraft ник'
  if (nick.length < 3) return 'Ник слишком короткий (мин. 3 символа)'
  if (nick.length > 16) return 'Ник слишком длинный (макс. 16 символов)'
  if (!/^[a-zA-Z0-9_]+$/.test(nick)) return 'Только латинские буквы, цифры и _'
  return null
}

function RankBadge({ product, active, onClick }: {
  product: Product
  active: boolean
  onClick: () => void
}) {
  const minPrice = Math.min(...product.variants.map(v => v.price))

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
        active
          ? 'border-site-accent bg-site-secondary glow-red'
          : 'border-site-border bg-site-block hover:border-site-border/80 hover:bg-site-block/80'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: product.color, boxShadow: active ? `0 0 8px ${product.color}` : 'none' }}
          />
          <span
            className="font-semibold text-sm"
            style={{ color: active ? product.color : '#F2F2F2' }}
          >
            {product.name}
          </span>
        </div>
        <span className="text-site-muted text-xs">от {minPrice} ₽</span>
      </div>
    </button>
  )
}

function DurationButton({ variant, active, onClick }: {
  variant: ProductVariant
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 rounded border text-sm font-medium transition-all ${
        active
          ? 'border-site-accent bg-site-secondary text-site-accent'
          : 'border-site-border bg-site-block text-site-muted hover:border-site-border/80 hover:text-site-text'
      }`}
    >
      <div className="text-center">
        <div>{variant.durationLabel}</div>
        <div className={`text-xs mt-0.5 ${active ? 'text-site-accent' : 'text-site-muted'}`}>
          {variant.price} ₽
        </div>
      </div>
    </button>
  )
}

export default function ShopClient({ products }: { products: Product[] }) {
  const router = useRouter()
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '')
  const [selectedDuration, setSelectedDuration] = useState<Duration>('30d')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const product = products.find(p => p.id === selectedProductId) ?? products[0]
  const variant = product?.variants.find(v => v.duration === selectedDuration) ?? product?.variants[0]

  const handleUsernameChange = (v: string) => {
    setUsername(v)
    if (usernameError) setUsernameError(validateUsername(v))
  }

  const handleBuy = async () => {
    const error = validateUsername(username)
    if (error) {
      setUsernameError(error)
      return
    }

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
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setOrderError(data.error ?? 'Ошибка создания заказа')
        return
      }

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
      <h1 className="font-pixel text-sm md:text-base text-site-accent mb-8 text-center md:text-left">
        МАГАЗИН ПРИВИЛЕГИЙ
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — rank list */}
        <div className="lg:col-span-1">
          <div className="bg-site-block border border-site-border rounded-lg p-4">
            <h2 className="text-site-muted text-xs uppercase tracking-wider mb-4">Выберите ранг</h2>
            <div className="flex flex-col gap-2">
              {products.map(p => (
                <RankBadge
                  key={p.id}
                  product={p}
                  active={p.id === selectedProductId}
                  onClick={() => {
                    setSelectedProductId(p.id)
                    setSelectedDuration('30d')
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right — rank details */}
        <div className="lg:col-span-2">
          <div className="bg-site-block border border-site-border rounded-lg p-6">
            {/* Rank header */}
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: product.color, boxShadow: `0 0 12px ${product.color}` }}
              />
              <h2
                className="font-pixel text-base md:text-lg"
                style={{ color: product.color }}
              >
                {product.name}
              </h2>
            </div>
            <p className="text-site-muted text-sm mb-6">{product.description}</p>

            {/* Duration selector */}
            <div className="mb-6">
              <h3 className="text-site-muted text-xs uppercase tracking-wider mb-3">Срок действия</h3>
              <div className="flex gap-2">
                {product.variants.map(v => (
                  <DurationButton
                    key={v.duration}
                    variant={v}
                    active={v.duration === selectedDuration}
                    onClick={() => setSelectedDuration(v.duration)}
                  />
                ))}
              </div>
            </div>

            {/* Perks */}
            <div className="mb-6">
              <h3 className="text-site-muted text-xs uppercase tracking-wider mb-3">Возможности</h3>
              <ul className="space-y-2">
                {product.perks.map(perk => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-site-text">
                    <svg
                      className="w-4 h-4 text-site-success mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Username */}
            <div className="mb-6">
              <h3 className="text-site-muted text-xs uppercase tracking-wider mb-3">Minecraft ник</h3>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={e => handleUsernameChange(e.target.value)}
                  onBlur={() => setUsernameError(validateUsername(username))}
                  placeholder="Введите ник (например: Notch)"
                  maxLength={16}
                  className={`w-full bg-site-bg border rounded px-4 py-3 text-site-text placeholder-site-muted/50 focus:outline-none transition-colors ${
                    usernameError
                      ? 'border-site-danger focus:border-site-danger'
                      : 'border-site-border focus:border-site-accent'
                  }`}
                />
              </div>
              {usernameError ? (
                <p className="mt-1.5 text-site-danger text-xs">{usernameError}</p>
              ) : (
                <p className="mt-1.5 text-site-muted text-xs">Проверь ник перед оплатой — возврат невозможен</p>
              )}
            </div>

            {/* Price + Buy */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-site-muted text-xs mb-1">Итого</div>
                <div className="text-2xl font-bold text-site-text">
                  {variant.price} <span className="text-site-muted text-lg">₽</span>
                </div>
              </div>

              <button
                onClick={handleBuy}
                disabled={loading || !username}
                className={`px-8 py-3 rounded font-bold text-sm transition-all ${
                  !username || loading
                    ? 'bg-site-border text-site-muted cursor-not-allowed'
                    : 'bg-site-accent hover:bg-red-600 text-white glow-red cursor-pointer'
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
                ) : (
                  'Купить'
                )}
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
