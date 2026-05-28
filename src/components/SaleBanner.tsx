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
    <div className="relative bg-gradient-to-r from-site-dark-red via-site-accent to-site-dark-red text-white text-sm">
      <div className="max-w-7xl mx-auto px-8 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs">
        <span className="font-semibold text-sm">🔥 Скидка 25% по промокоду</span>
        <span className="font-pixel text-[10px] bg-black/30 px-2 py-0.5 rounded tracking-widest">SUMMER25</span>
        <span className="text-white/70 hidden sm:inline">·</span>
        <span className="font-mono font-bold tabular-nums">
          {pad(timeLeft.h)}:{pad(timeLeft.m)}:{pad(timeLeft.s)}
        </span>
        <Link href="/shop" className="underline underline-offset-2 font-semibold hover:no-underline whitespace-nowrap">
          В магазин →
        </Link>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 text-lg leading-none"
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  )
}
