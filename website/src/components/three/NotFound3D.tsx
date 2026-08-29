'use client'

// 3D backdrop for the 404 page: large slowly-rotating 'god' voxel emblem
// with a DriftField of scattered cubes and atmospheric fog.

import { Canvas } from '@react-three/fiber'
import { VoxelMesh, DriftField } from './voxel'

export default function NotFound3D() {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia != null &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 18], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <fog attach="fog" args={['#070707', 16, 36]} />
        <ambientLight intensity={0.3} />
        <pointLight position={[6, 8, 10]} intensity={280} color="#FF2B4F" distance={70} decay={2} />
        <pointLight position={[-8, -6, -6]} intensity={100} color="#8B1830" distance={60} decay={2} />
        <directionalLight position={[0, 8, 6]} intensity={0.5} color="#ffffff" />
        <group scale={1.3}>
          <VoxelMesh rank="god" color="#FF2B4F" spin={!reduce} spinSpeed={0.18} bob={!reduce} />
        </group>
        {!reduce && <DriftField count={52} color="#FF2B4F" />}
      </Canvas>
    </div>
  )
}
