'use client'

// Small self-contained 3D voxel bust rendered inside its own Canvas.
// One instance per rank column header. SSR-safe (loaded via dynamic ssr:false).

import { Canvas } from '@react-three/fiber'
import { VoxelMesh } from './voxel'

export default function CompareRankBust({
  rank,
  color,
  spin,
}: {
  rank: string
  color: string
  spin: boolean
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <ambientLight intensity={0.45} color="#ffffff" />
      <pointLight
        position={[4, 6, 6]}
        intensity={90}
        color={color}
        distance={28}
        decay={2}
      />
      <pointLight
        position={[-3, -4, 4]}
        intensity={40}
        color={color}
        distance={22}
        decay={2}
      />
      <directionalLight
        position={[2, 5, 4]}
        intensity={1.2}
        color="#ffffff"
      />
      <VoxelMesh
        rank={rank}
        color={color}
        spin={spin}
        scale={0.42}
        spinSpeed={0.45}
        bob={spin}
      />
    </Canvas>
  )
}
