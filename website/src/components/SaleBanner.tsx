'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const SALE_CODE = process.env.NEXT_PUBLIC_SALE_CODE ?? 'SUMMER25'
const SALE_DISCOUNT = process.env.NEXT_PUBLIC_SALE_DISCOUNT ?? '−25%'
const DISMISS_KEY = `sale-dismissed:${SALE_CODE}`

function getSaleEnd(): number | null {
  const raw = process.env.NEXT_PUBLIC_SALE_END
  if (!raw) return null
  const ts = Date.parse(raw)
  if (Number.isNaN(ts)) return null
  return ts
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatTimeLeft(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`
  return days > 0 ? `${days}д ${clock}` : clock
}

export default function SaleBanner() {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [msLeft, setMsLeft] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)

    try {
      if (localStorage.getItem(DISMISS_KEY)) {
        setDismissed(true)
        return
      }
    } catch {
      // localStorage unavailable — show the banner anyway
    }

    const end = getSaleEnd()
    if (end === null) return

    const tick = () => setMsLeft(Math.max(0, end - Date.now()))

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore — banner stays hidden for this session
    }
  }

  function copyPromo() {
    navigator.clipboard.writeText(SALE_CODE).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // No fake urgency: render nothing until mounted (hydration safety),
  // when dismissed, or when there is no valid future sale end
  if (!mounted || dismissed || msLeft <= 0) return null

  return (
    <div className="relative bg-[#0d0000] border-b border-[#3A1017] overflow-hidden">
      {/* Red stripe accent on left */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-site-accent" />

      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-r from-site-accent/5 via-transparent to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-8 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
        {/* Alert icon + label */}
        <div className="flex items-center gap-2">
          <span className="text-site-accent animate-blink text-sm font-bold">⚠</span>
          <span
            className="text-[10px] text-site-accent tracking-[0.35em] uppercase font-bold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ОПЕРАЦИЯ АКТИВНА
          </span>
        </div>

        <div className="w-px h-3 bg-[#3A1017] hidden sm:block" />

        {/* Promo code */}
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] text-[#888] tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ПРОМОКОД:
          </span>
          <button
            onClick={copyPromo}
            className={`text-[11px] px-2.5 py-0.5 tracking-[0.25em] font-bold transition-all duration-200 cursor-pointer ${
              copied
                ? 'text-green-400 bg-green-500/15 border border-green-500/50'
                : 'text-white bg-site-accent/15 border border-site-accent/40 hover:bg-site-accent/25 hover:border-site-accent/70'
            }`}
            style={{ fontFamily: '"JetBrains Mono", monospace', clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
            title="Нажми чтобы скопировать"
          >
            {copied ? '✓ СКОПИРОВАНО' : SALE_CODE}
          </button>
          <span
            className="text-[10px] text-site-accent tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {SALE_DISCOUNT}
          </span>
        </div>

        <div className="w-px h-3 bg-[#3A1017] hidden sm:block" />

        {/* Countdown */}
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] text-[#888] tracking-[0.3em] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ИСТЕКАЕТ:
          </span>
          <span
            className="text-[13px] text-white font-bold tabular-nums tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {formatTimeLeft(msLeft)}
          </span>
        </div>

        <div className="w-px h-3 bg-[#3A1017] hidden sm:block" />

        {/* CTA */}
        <Link
          href="/shop"
          className="text-[10px] text-site-accent hover:text-white tracking-[0.25em] uppercase font-bold transition-colors border-b border-site-accent/40 hover:border-white pb-px"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          В МАГАЗИН →
        </Link>
      </div>

      {/* Close button */}
      <button
        onClick={dismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3A1017] hover:text-site-accent transition-colors text-base leading-none p-1"
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  )
}
