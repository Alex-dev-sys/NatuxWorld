export const metadata = {
  title: 'Карта — NATUX WORLD',
}

import MapWorld3DLoader from '@/components/three/MapWorld3DLoader'

const X_RULER = ['000', '128', '256', '384', '512', '640']
const Y_RULER = ['N', '64', '128', '192', 'S']

export default function MapPage() {
  return (
    <div className="map-root max-w-5xl mx-auto px-4 py-12">
      <style>{`
        .map-sweep { animation: map-sweep 4s linear infinite; }
        @keyframes map-sweep {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(900%); opacity: 0; }
        }
        .map-blip { animation: map-blip 2.4s ease-in-out infinite; }
        @keyframes map-blip { 0%, 100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        @media (prefers-reduced-motion: reduce) {
          .map-sweep, .map-blip { animation: none; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-7 animate-fade-in-up">
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#FF2B4F', letterSpacing: '0.4em', marginBottom: 10 }}>
          {'// СПУТНИКОВАЯ РАЗВЕДКА'}
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 30, backgroundColor: '#FF2B4F' }} className="glow-red" />
          <h1 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(40px, 9vw, 72px)',
            letterSpacing: '0.06em',
            lineHeight: 0.95,
            color: '#fff',
          }}>
            КАРТА МИРА
          </h1>
        </div>
        <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#888', letterSpacing: '0.25em', textTransform: 'uppercase', marginLeft: 15 }}>
          {'>'} ОНЛАЙН-КАРТА МИРА NATUX WORLD
        </p>
      </div>

      {/* ── 3D World — centerpiece ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 32, border: '1px solid #2a1018' }}>
        {/* Tactical frame corners */}
        {([
          { top: 0, left: 0, bw: '2px 0 0 2px' },
          { top: 0, right: 0, bw: '2px 2px 0 0' },
          { bottom: 0, left: 0, bw: '0 0 2px 2px' },
          { bottom: 0, right: 0, bw: '0 2px 2px 0' },
        ] as const).map((c, i) => (
          <div key={i} style={{
            position: 'absolute', width: 22, height: 22, zIndex: 10,
            borderStyle: 'solid', borderColor: '#FF2B4F', borderWidth: c.bw,
            ...c,
          }} />
        ))}

        {/* Status strip */}
        <div className="flex items-center justify-between" style={{
          padding: '6px 12px',
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          letterSpacing: '0.3em', color: '#7a3540', textTransform: 'uppercase',
          borderBottom: '1px solid #1a0810',
        }}>
          <span style={{ color: '#FF2B4F' }}>ТАКТИЧЕСКАЯ 3D-КАРТА // LIVE</span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#35C759' }} className="map-blip" />
            <span style={{ color: '#35C759' }}>СИГНАЛ</span>
          </span>
        </div>

        {/* 3D Canvas */}
        <div style={{ width: '100%', height: '70vh', minHeight: 420, background: '#070707', position: 'relative' }}>
          <MapWorld3DLoader />

          {/* Overlay legend */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16, zIndex: 10,
            display: 'flex', flexDirection: 'column', gap: 6,
            background: 'rgba(7,7,7,0.80)', border: '1px solid #2a1018',
            padding: '10px 14px',
            pointerEvents: 'none',
          }}>
            {[
              { color: '#50C878', label: 'SPAWN' },
              { color: '#FF2B4F', label: 'PVP ZONE' },
              { color: '#F0A500', label: 'WARZONE' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.2em', color: '#888' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, display: 'inline-block' }} />
                {label}
              </div>
            ))}
          </div>

          {/* Drag hint */}
          <div style={{
            position: 'absolute', bottom: 16, right: 16, zIndex: 10,
            fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
            letterSpacing: '0.2em', color: '#5a2730', textTransform: 'uppercase',
            background: 'rgba(7,7,7,0.80)', border: '1px solid #2a1018',
            padding: '6px 12px',
            pointerEvents: 'none',
          }}>
            {'DRAG TO ROTATE · SCROLL TO ZOOM'}
          </div>
        </div>

        {/* Bottom coordinate readout */}
        <div className="flex items-center justify-between flex-wrap gap-2" style={{
          padding: '6px 12px',
          fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          letterSpacing: '0.25em', color: '#5a2730', textTransform: 'uppercase',
          borderTop: '1px solid #1a0810',
        }}>
          <span>{'// КООРД. X:0 Z:0 — ТОЧКА СПАВНА'}</span>
          <span>МАСШТАБ 1:512 · СЕКТОР A-01</span>
        </div>
      </div>

      {/* ── Legacy tactical frame (rulers + blips + VK link) ──────────────── */}
      <div style={{ position: 'relative', padding: '26px 22px' }}>
        {/* Corner markers */}
        {([
          { top: 0, left: 0, bw: '2px 0 0 2px' },
          { top: 0, right: 0, bw: '2px 2px 0 0' },
          { bottom: 0, left: 0, bw: '0 0 2px 2px' },
          { bottom: 0, right: 0, bw: '0 2px 2px 0' },
        ] as const).map((c, i) => (
          <div key={i} style={{
            position: 'absolute', width: 22, height: 22,
            borderStyle: 'solid', borderColor: '#FF2B4F', borderWidth: c.bw,
            ...c,
          }} />
        ))}

        {/* Top status strip */}
        <div className="flex items-center justify-between mb-3" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.3em', color: '#7a3540', textTransform: 'uppercase' }}>
          <span style={{ color: '#FF2B4F' }}>СПУТНИКОВАЯ РАЗВЕДКА // LIVE</span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#35C759' }} className="map-blip" />
            <span style={{ color: '#35C759' }}>СИГНАЛ</span>
          </span>
        </div>

        {/* X ruler (top) */}
        <div className="flex justify-between" style={{ marginLeft: 26, marginRight: 4, marginBottom: 4 }}>
          {X_RULER.map(x => (
            <span key={x} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#5a2730', letterSpacing: '0.15em' }}>{x}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {/* Y ruler (left) */}
          <div className="flex flex-col justify-between" style={{ paddingBottom: 18 }}>
            {Y_RULER.map(y => (
              <span key={y} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#5a2730', letterSpacing: '0.1em', width: 20, textAlign: 'right' }}>{y}</span>
            ))}
          </div>

          {/* Map viewport */}
          <div className="scanline grid-bg clip-angle" style={{
            flex: 1,
            position: 'relative',
            border: '1px solid #3A1017',
            background: 'radial-gradient(circle at 50% 40%, #140a0b, #070707)',
            minHeight: 340,
            overflow: 'hidden',
          }}>
            {/* Radar sweep line */}
            <div className="map-sweep" style={{
              position: 'absolute', left: 0, right: 0, top: 0, height: 60,
              background: 'linear-gradient(to bottom, transparent, rgba(255,43,79,0.10), transparent)',
              pointerEvents: 'none', zIndex: 3,
            }} />

            {/* Crosshair center */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,43,79,0.12)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,43,79,0.12)' }} />
            </div>

            {/* Sample blips */}
            {[
              { left: '28%', top: '34%', c: '#FF2B4F' },
              { left: '63%', top: '52%', c: '#35C759' },
              { left: '46%', top: '70%', c: '#F0A500' },
            ].map((b, i) => (
              <span key={i} className="map-blip" style={{
                position: 'absolute', left: b.left, top: b.top,
                width: 8, height: 8, borderRadius: '50%', background: b.c,
                boxShadow: `0 0 10px ${b.c}`, zIndex: 2, animationDelay: `${i * 0.5}s`,
              }} />
            ))}

            {/* Placeholder content */}
            <div className="flex flex-col items-center justify-center text-center gap-4" style={{ position: 'absolute', inset: 0, zIndex: 2, padding: 24 }}>
              <div style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(28px, 6vw, 46px)',
                color: '#fff', letterSpacing: '0.04em', lineHeight: 1,
              }}>
                КАРТА В РЕЖИМЕ ОЖИДАНИЯ
              </div>
              <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#888', maxWidth: 420, lineHeight: 1.7, letterSpacing: '0.05em' }}>
                Интерактивная карта мира (Dynmap / BlueMap) будет подключена
                после запуска сервера. Следи за обновлениями в VK.
              </p>
              <a
                href="https://vk.com/natuxworld"
                target="_blank"
                rel="noopener noreferrer"
                className="clip-angle-sm"
                style={{
                  marginTop: 6,
                  padding: '10px 24px',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: '#FF2B4F',
                  border: '1px solid #FF2B4F',
                  background: '#FF2B4F12',
                  transition: 'all 0.18s ease',
                  display: 'inline-block',
                }}
              >
                {'>'} ПЕРЕЙТИ В VK
              </a>
            </div>
          </div>
        </div>

        {/* Bottom coordinate readout */}
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginTop: 12, marginLeft: 26, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, letterSpacing: '0.25em', color: '#5a2730', textTransform: 'uppercase' }}>
          <span>{'// КООРД. X:0 Z:0 — ТОЧКА СПАВНА'}</span>
          <span>МАСШТАБ 1:512 · СЕКТОР A-01</span>
        </div>
      </div>
    </div>
  )
}
