'use client'

// Фоновая 3D-сцена hero: поле дрейфующих кубов + туман. Прозрачный фон.
// Перф: Canvas монтируется только когда секция в зоне видимости (IntersectionObserver),
// иначе при скролле вниз WebGL-цикл крутился бы впустую за экраном.

import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { DriftField } from './voxel'

export default function Hero3D({
  color = '#FF2B4F',
  className,
}: {
  color?: string
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    setReduce(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { rootMargin: '120px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      {inView && !reduce && (
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 16], fov: 46 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          style={{ background: 'transparent' }}
        >
          <fog attach="fog" args={['#070707', 14, 32]} />
          <ambientLight intensity={0.4} />
          <pointLight position={[8, 6, 10]} intensity={220} color={color} distance={60} decay={2} />
          <pointLight position={[-9, -5, -4]} intensity={120} color="#4A7FBB" distance={60} decay={2} />
          <directionalLight position={[0, 10, 6]} intensity={0.8} color="#ffffff" />
          <DriftField count={46} color={color} />
        </Canvas>
      )}
    </div>
  )
}
