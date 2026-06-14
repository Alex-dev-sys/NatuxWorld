'use client'

// Общая воксель-логика: строит 3D-кубы из 16×16 пиксель-карты эмблемы и
// рендерит их через InstancedMesh. Переиспользуется RankModel3D и Hero3D.

import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EMBLEMS, GRID, SPECIAL, OUTLINE, shade } from '../RankEmblem'

export type Voxel = { x: number; y: number; depth: number; color: string; special: boolean }

export function buildVoxels(rank: string, color: string): Voxel[] {
  const key = rank.trim().toLowerCase()
  const map = EMBLEMS[key] ?? EMBLEMS.baron
  const palette: Record<string, string> = {
    '0': OUTLINE,
    '1': shade(color, -0.12),
    '2': shade(color, 0.38),
    '3': SPECIAL[key] ?? shade(color, 0.65),
  }
  const out: Voxel[] = []
  for (let y = 0; y < GRID; y++) {
    const row = map[y]
    if (!row) continue
    for (let x = 0; x < GRID; x++) {
      const c = row[x]
      if (!c || c === '.') continue
      const special = c === '3'
      const outline = c === '0'
      const depth = outline ? 0.55 : special ? 1.7 : 1.1
      out.push({ x: x - GRID / 2 + 0.5, y: GRID / 2 - y - 0.5, depth, color: palette[c], special })
    }
  }
  return out
}

export function VoxelMesh({
  rank,
  color,
  spin = true,
  scale = 0.46,
  spinSpeed = 0.5,
  bob = true,
}: {
  rank: string
  color: string
  spin?: boolean
  scale?: number
  spinSpeed?: number
  bob?: boolean
}) {
  const voxels = useMemo(() => buildVoxels(rank, color), [rank, color])
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const maxDepth = useMemo(() => voxels.reduce((m, v) => Math.max(m, v.depth), 1), [voxels])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    voxels.forEach((v, i) => {
      dummy.position.set(v.x, v.y, v.depth / 2 - maxDepth / 2)
      dummy.scale.set(0.92, 0.92, v.depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      col.set(v.color)
      if (v.special) col.multiplyScalar(1.15)
      mesh.setColorAt(i, col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [voxels, maxDepth])

  useFrame((state, delta) => {
    const g = groupRef.current
    if (!g) return
    if (spin) {
      g.rotation.y += delta * spinSpeed
      g.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.18
      if (bob) g.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.4
    } else {
      g.rotation.y = -0.35
      g.rotation.x = 0.12
    }
  })

  return (
    <group ref={groupRef} scale={scale}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.35} metalness={0.55} envMapIntensity={0.6} />
      </instancedMesh>
    </group>
  )
}

// Поле дрейфующих кубов-частиц для фоновых сцен.
export function DriftField({ count = 40, color = '#FF2B4F' }: { count?: number; color?: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (((i * 73) % 100) / 100 - 0.5) * 22,
        y: (((i * 37) % 100) / 100 - 0.5) * 14,
        z: (((i * 53) % 100) / 100 - 0.5) * 14 - 4,
        s: 0.12 + (((i * 17) % 100) / 100) * 0.34,
        sp: 0.2 + (((i * 29) % 100) / 100) * 0.7,
      })),
    [count],
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    seeds.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [seeds])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    seeds.forEach((p, i) => {
      const y = ((p.y + t * p.sp + 7) % 14) - 7
      dummy.position.set(p.x, y, p.z)
      dummy.rotation.set(t * p.sp, t * p.sp * 0.7, 0)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} transparent opacity={0.5} />
    </instancedMesh>
  )
}
