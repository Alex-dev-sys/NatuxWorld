'use client'

import { useEffect, useRef, useState } from 'react'

// ─── reduced-motion gate ──────────────────────────────────────────────────────
// Все премиум-эффекты уважают системную настройку «уменьшить движение».
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

// ─── count-up odometer ────────────────────────────────────────────────────────
// Плавно «прокручивает» число при изменении (премиальный счётчик цены).
export function useCountUp(target: number, durationMs = 520): number {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number>()
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (reduced) { setValue(target); return }
    const from = fromRef.current
    if (from === target) return
    startRef.current = 0

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const t = Math.min(1, (ts - startRef.current) / durationMs)
      // easeOutCubic — быстрый старт, мягкое торможение
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, durationMs, reduced])

  return value
}

// ─── interactive premium card ─────────────────────────────────────────────────
// Оборачивает контент: курсор-«прожектор» в цвет ранга + лёгкий 3D-наклон.
// Чистый CSS-переменный подход — ноль ре-рендеров на mousemove.
export function PremiumCard({
  color,
  children,
  className,
  style,
  tilt = 4,
}: {
  color: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  tilt?: number
}) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width   // 0..1
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
    el.style.setProperty('--rx', `${(0.5 - py) * tilt}deg`)
    el.style.setProperty('--ry', `${(px - 0.5) * tilt}deg`)
  }

  const reset = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    setActive(false)
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={reset}
      className={`premium-card ${className ?? ''}`}
      style={{
        ['--rank' as string]: color,
        ['--mx' as string]: '50%',
        ['--my' as string]: '0%',
        transform: reduced
          ? undefined
          : 'perspective(1100px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))',
        transition: 'transform 0.35s cubic-bezier(0.22,0.61,0.36,1)',
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {/* курсор-прожектор: радиальное свечение в цвет ранга, тает к краям */}
      {!reduced && (
        <div
          aria-hidden
          className="premium-spotlight"
          style={{
            opacity: active ? 1 : 0,
            background:
              `radial-gradient(380px circle at var(--mx) var(--my), ${color}1f, transparent 60%)`,
          }}
        />
      )}
      {children}
    </div>
  )
}
