'use client'

// Hero backdrop for /join: glowing torus portal + particle stream.
// Transparent canvas, pointer-events-none, sits behind launcher CTA.

import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DriftField } from './voxel'

// ─── Torus portal ring ─────────────────────────────────────────────────────────
function PortalRing({ reduce }: { reduce: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const outerRef = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    if (reduce) return
    const g = groupRef.current
    if (g) {
      g.rotation.y += delta * 0.28
      g.rotation.x = Math.sin(state.clock.elapsedTime * 0.22) * 0.15
    }
    const inn = innerRef.current
    if (inn) inn.rotation.z += delta * 0.55
    const out = outerRef.current
    if (out) out.rotation.z -= delta * 0.32
  })

  return (
    <group ref={groupRef}>
      {/* outer ring — accent red */}
      <mesh ref={outerRef}>
        <torusGeometry args={[3.8, 0.22, 20, 80]} />
        <meshStandardMaterial
          color="#FF2B4F"
          emissive="#FF2B4F"
          emissiveIntensity={2.2}
          roughness={0.15}
          metalness={0.7}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* inner ring — blue accent, counter-rotating */}
      <mesh ref={innerRef}>
        <torusGeometry args={[2.8, 0.14, 16, 64]} />
        <meshStandardMaterial
          color="#4A7FBB"
          emissive="#4A7FBB"
          emissiveIntensity={1.8}
          roughness={0.2}
          metalness={0.6}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* portal face — dark energy disc */}
      <mesh>
        <circleGeometry args={[2.75, 64]} />
        <meshStandardMaterial
          color="#0a0208"
          emissive="#FF2B4F"
          emissiveIntensity={0.18}
          roughness={1}
          metalness={0}
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// ─── Particle stream funneling toward portal ───────────────────────────────────
function ParticleStream({ reduce }: { reduce: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const COUNT = 80

  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2
        const radius = 5 + ((i * 43) % 100) / 100 * 6
        const speed = 0.18 + ((i * 29) % 100) / 100 * 0.55
        const phase = (i * 53) % 100 / 100 * Math.PI * 2
        const side = i % 2 === 0 ? 1 : -1
        return { angle, radius, speed, phase, side, size: 0.06 + ((i * 17) % 100) / 100 * 0.1 }
      }),
    [],
  )

  useFrame((state) => {
    if (reduce) return
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const dummy = new THREE.Object3D()
    seeds.forEach((p, i) => {
      // spiral inward over time — progress from outer ring to portal center
      const progress = ((t * p.speed + p.phase) % (Math.PI * 2)) / (Math.PI * 2)
      const r = p.radius * (1 - progress * 0.85) // shrinks from outer to center
      const a = p.angle + t * p.speed * p.side * 0.4
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r * 0.5
      const z = (progress - 0.5) * 3 // move through the portal plane
      dummy.position.set(x, y, z)
      dummy.scale.setScalar(p.size * (1 - progress * 0.6))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  // static fallback positions for reduced motion
  useFrame(() => {
    if (!reduce) return
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    seeds.forEach((p, i) => {
      const x = Math.cos(p.angle) * p.radius * 0.4
      const y = Math.sin(p.angle) * p.radius * 0.2
      dummy.position.set(x, y, 0)
      dummy.scale.setScalar(p.size * 0.6)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#FF2B4F"
        emissive="#FF2B4F"
        emissiveIntensity={1.4}
        roughness={0.3}
        metalness={0.5}
        transparent
        opacity={0.7}
      />
    </instancedMesh>
  )
}

// ─── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ reduce }: { reduce: boolean }) {
  return (
    <>
      <fog attach="fog" args={['#070707', 10, 38]} />
      <ambientLight intensity={0.25} />
      {/* strong accent glow at portal center */}
      <pointLight position={[0, 0, 0]} intensity={340} color="#FF2B4F" distance={18} decay={2} />
      {/* rim light — cool blue */}
      <pointLight position={[-8, 4, -6]} intensity={160} color="#4A7FBB" distance={30} decay={2} />
      {/* fill */}
      <pointLight position={[6, -4, 8]} intensity={80} color="#FF2B4F" distance={25} decay={2} />
      <PortalRing reduce={reduce} />
      <ParticleStream reduce={reduce} />
      {!reduce && <DriftField count={28} color="#4A7FBB" />}
    </>
  )
}

// ─── Export ────────────────────────────────────────────────────────────────────
export default function JoinPortal3D({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const reduce =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <div className={className} aria-hidden="true" style={{ pointerEvents: 'none', ...style }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 12], fov: 52 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Scene reduce={reduce} />
      </Canvas>
    </div>
  )
}
