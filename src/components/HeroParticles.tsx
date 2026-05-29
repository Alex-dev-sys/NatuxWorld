'use client'

import { useEffect, useRef } from 'react'

type Particle = {
  x: number; y: number; size: number
  vx: number; vy: number; opacity: number
  color: string; fadeDir: number
}

const COLORS = ['#FF2B4F', '#FF2B4F', '#4A7FBB', '#50C878', '#9B59B6', '#3A1017', '#FF2B4F']

function spawn(w: number, h: number, randomY = false): Particle {
  return {
    x: Math.random() * w,
    y: randomY ? Math.random() * h : h + 10,
    size: Math.floor(Math.random() * 3 + 2),
    vx: (Math.random() - 0.5) * 0.4,
    vy: -(Math.random() * 0.6 + 0.25),
    opacity: Math.random() * 0.5 + 0.15,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    fadeDir: 1,
  }
}

export default function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let particles: Particle[] = []

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    resize()

    for (let i = 0; i < 32; i++) {
      particles.push(spawn(canvas.width, canvas.height, true))
    }

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.opacity += p.fadeDir * 0.004
        if (p.opacity > 0.75 || p.opacity < 0.08) p.fadeDir *= -1
        if (p.y < -8) {
          particles[i] = spawn(canvas.width, canvas.height)
          continue
        }
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
      }

      ctx.globalAlpha = 1
      animId = requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
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
