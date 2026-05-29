'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

function getEndOfDay(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 0)
  return d
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function SaleBanner() {
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 })
  const [visible, setVisible] = useState(true)
  const [copied, setCopied] = useState(false)

  function copyPromo() {
    navigator.clipboard.writeText('SUMMER25').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  useEffect(() => {
    const target = getEndOfDay()

    const tick = () => {
      const diff = Math.max(0, target.getTime() - Date.now())
      setTimeLeft({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      })
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!visible) return null

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
            {copied ? '✓ СКОПИРОВАНО' : 'SUMMER25'}
          </button>
          <span
            className="text-[10px] text-site-accent tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            −25%
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
            {pad(timeLeft.h)}:{pad(timeLeft.m)}:{pad(timeLeft.s)}
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
        onClick={() => setVisible(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3A1017] hover:text-site-accent transition-colors text-base leading-none p-1"
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  )
}
