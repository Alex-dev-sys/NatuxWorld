'use client'

// 3D-воксельный герб ранга на прозрачном canvas. Pixel-art → voxel-art.

import { Canvas } from '@react-three/fiber'
import { VoxelMesh } from './voxel'

export default function RankModel3D({
  rank,
  color,
  size = 280,
  spin = true,
  className,
}: {
  rank: string
  color: string
  size?: number
  spin?: boolean
  className?: string
}) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`3D-герб ранга ${rank}`}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 13], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.55} />
        <pointLight position={[6, 6, 8]} intensity={140} color={color} distance={40} decay={2} />
        <pointLight position={[-7, -4, -6]} intensity={70} color="#4A7FBB" distance={40} decay={2} />
        <directionalLight position={[0, 8, 4]} intensity={1.1} color="#ffffff" />
        <VoxelMesh rank={rank} color={color} spin={spin && !reduce} />
      </Canvas>
    </div>
  )
}
