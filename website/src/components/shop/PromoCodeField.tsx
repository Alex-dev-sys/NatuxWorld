'use client'

import { useState } from 'react'
import type { Coupon } from '@/lib/types'

// ─── promo code ───────────────────────────────────────────────────────────────

// Активная акция (из env) — подсказка под полем ввода.
const SALE_CODE = process.env.NEXT_PUBLIC_SALE_CODE ?? ''
const SALE_DISCOUNT = process.env.NEXT_PUBLIC_SALE_DISCOUNT ?? ''

export default function PromoCodeField({ onApply, onRemove, applied }: {
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
