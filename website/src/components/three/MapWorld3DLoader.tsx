'use client'

// SSR-safe dynamic import for the WebGL map scene.
import dynamic from 'next/dynamic'

const MapWorld3D = dynamic(() => import('./MapWorld3D'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#070707',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        color: '#5a2730',
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
      }}
    >
      {'// ЗАГРУЗКА КАРТЫ...'}
    </div>
  ),
})

export default MapWorld3D
