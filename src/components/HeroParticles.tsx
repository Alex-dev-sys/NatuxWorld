'use client'

import { useEffect, useRef } from 'react'

type Particle = {
  x: number; y: number; size: number
  vx: number; vy: number; opacity: number
  color: string; fadeDir: number; depth: number
}

const COLORS = ['#FF2B4F', '#FF2B4F', '#4A7FBB', '#50C878', '#9B59B6', '#3A1017', '#FF2B4F']

// depth: 0 = far (small, slow, dim), 1 = near (bigger, faster, brighter)
function spawn(w: number, h: number, randomY = false): Particle {
  const depth = Math.random()
  return {
    x: Math.random() * w,
    y: randomY ? Math.random() * h : h + 10,
    size: Math.floor(depth * 2 + 2),
    vx: (Math.random() - 0.5) * 0.4 * (0.4 + depth),
    vy: -(Math.random() * 0.5 + 0.2) * (0.5 + depth),
    opacity: (Math.random() * 0.4 + 0.12) * (0.45 + depth * 0.55),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    fadeDir: 1,
    depth,
  }
}

export default function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let animId: number
    let particles: Particle[] = []
    // pointer-driven parallax target (subtle)
    let px = 0
    let py = 0
    let cx = 0
    let cy = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      px = (e.clientX - r.left) / r.width - 0.5
      py = (e.clientY - r.top) / r.height - 0.5
    }

    resize()

    const COUNT = 36
    for (let i = 0; i < COUNT; i++) {
      particles.push(spawn(canvas.width, canvas.height, true))
    }

    const drawStatic = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
      }
      ctx.globalAlpha = 1
    }

    if (reduce) {
      // Render one static depth field, no animation.
      drawStatic()
      window.addEventListener('resize', () => { resize(); drawStatic() })
      return () => window.removeEventListener('resize', resize)
    }

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // ease pointer parallax
      cx += (px - cx) * 0.04
      cy += (py - cy) * 0.04

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.opacity += p.fadeDir * 0.004
        if (p.opacity > 0.7 || p.opacity < 0.06) p.fadeDir *= -1
        if (p.y < -8) {
          particles[i] = spawn(canvas.width, canvas.height)
          continue
        }
        // near particles drift more with pointer
        const ox = cx * (8 + p.depth * 26)
        const oy = cy * (8 + p.depth * 26)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(Math.round(p.x + ox), Math.round(p.y + oy), p.size, p.size)
      }

      ctx.globalAlpha = 1
      animId = requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointer)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 1,
      }}
    />
  )
}
