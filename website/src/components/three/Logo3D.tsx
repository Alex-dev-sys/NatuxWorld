'use client'

// Лёгкий вращающийся 3D-куб для логотипа в header — чистый CSS (без WebGL).
// Раньше был отдельный <Canvas> на КАЖДОЙ странице → лишний WebGL-контекст и
// RAF-цикл. CSS-трансформы дают тот же вид почти бесплатно (GPU compositing).

const SIZE = 30
const H = SIZE / 2

const FACE_BASE: React.CSSProperties = {
  position: 'absolute',
  width: SIZE,
  height: SIZE,
  border: '1px solid #ff6b82',
  boxShadow: 'inset 0 0 8px rgba(0,0,0,0.35)',
}

export default function Logo3D() {
  return (
    <div aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center', perspective: 200 }}>
      <style>{`
        @keyframes logo-cube-spin { from { transform: rotateX(-22deg) rotateY(0deg); } to { transform: rotateX(-22deg) rotateY(360deg); } }
        .logo-cube { position: relative; transform-style: preserve-3d; animation: logo-cube-spin 9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .logo-cube { animation: none; transform: rotateX(-22deg) rotateY(-35deg); } }
      `}</style>
      <div className="logo-cube" style={{ width: SIZE, height: SIZE }}>
        <div style={{ ...FACE_BASE, background: '#FF2B4F', transform: `translateZ(${H}px)` }} />
        <div style={{ ...FACE_BASE, background: '#c01530', transform: `rotateY(180deg) translateZ(${H}px)` }} />
        <div style={{ ...FACE_BASE, background: '#e01f42', transform: `rotateY(90deg) translateZ(${H}px)` }} />
        <div style={{ ...FACE_BASE, background: '#a01228', transform: `rotateY(-90deg) translateZ(${H}px)` }} />
        <div style={{ ...FACE_BASE, background: '#ff5067', transform: `rotateX(90deg) translateZ(${H}px)` }} />
        <div style={{ ...FACE_BASE, background: '#8b0018', transform: `rotateX(-90deg) translateZ(${H}px)` }} />
      </div>
    </div>
  )
}
