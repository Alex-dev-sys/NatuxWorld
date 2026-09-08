'use client'

import type { ProductVariant } from '@/lib/types'

// ─── duration button ──────────────────────────────────────────────────────────

export default function DurationButton({ variant, active, saving, color, onClick }: {
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
