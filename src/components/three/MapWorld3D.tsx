'use client'

import { useRef, useMemo, useLayoutEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { DriftField } from './voxel'

// ── Deterministic heightmap ──────────────────────────────────────────────────
// Uses sin/cos of grid coords — stable across renders, no random.
function getHeight(x: number, z: number): number {
  const nx = x * 0.18
  const nz = z * 0.22
  const h =
    Math.sin(nx * 1.3) * Math.cos(nz * 1.1) * 1.8 +
    Math.sin(nx * 2.7 + 0.9) * Math.cos(nz * 2.4 + 0.5) * 0.9 +
    Math.sin(nx * 5.1 + 2.1) * Math.cos(nz * 4.8 + 1.4) * 0.4
  return h
}

// Map height [-3.1 .. 3.1] to color
function heightColor(h: number): THREE.Color {
  const t = (h + 3.1) / 6.2 // 0..1
  if (t < 0.28) {
    // Water — dark blue
    return new THREE.Color().setHSL(0.62, 0.7, 0.15 + t * 0.25)
  } else if (t < 0.55) {
    // Low land — red-tinted
    return new THREE.Color().setHSL(0.97, 0.55, 0.20 + (t - 0.28) * 0.35)
  } else if (t < 0.78) {
    // Mid land — muted crimson-grey
    return new THREE.Color().setHSL(0.97, 0.35, 0.28 + (t - 0.55) * 0.3)
  } else {
    // Peaks — bright near-white with red tint
    return new THREE.Color().setHSL(0.0, 0.55, 0.55 + (t - 0.78) * 1.2)
  }
}

// ── Terrain InstancedMesh ────────────────────────────────────────────────────
const GRID_W = 36
const GRID_D = 36
const VOXEL_SIZE = 1.0
const TOTAL = GRID_W * GRID_D

function Terrain() {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { positions, colors, heights } = useMemo(() => {
    const positions: [number, number, number][] = []
    const colors: THREE.Color[] = []
    const heights: number[] = []
    for (let iz = 0; iz < GRID_D; iz++) {
      for (let ix = 0; ix < GRID_W; ix++) {
        const wx = (ix - GRID_W / 2) * VOXEL_SIZE
        const wz = (iz - GRID_D / 2) * VOXEL_SIZE
        const h = getHeight(ix, iz)
        const blockH = Math.max(1, Math.round(h * 1.5 + 3))
        const wy = (blockH * VOXEL_SIZE) / 2 - 2
        positions.push([wx, wy, wz])
        colors.push(heightColor(h))
        heights.push(blockH)
      }
    }
    return { positions, colors, heights }
  }, [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    positions.forEach(([x, y, z], i) => {
      const blockH = heights[i]
      dummy.position.set(x, y, z)
      dummy.scale.set(VOXEL_SIZE * 0.96, blockH * VOXEL_SIZE, VOXEL_SIZE * 0.96)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, colors[i])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [positions, colors, heights])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOTAL]} receiveShadow castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.65} metalness={0.2} vertexColors />
    </instancedMesh>
  )
}

// ── Tactical marker: glowing beam + label ────────────────────────────────────
interface MarkerProps {
  position: [number, number, number]
  label: string
  color: string
  beamHeight?: number
}

function TacticalMarker({ position, label, color, beamHeight = 6 }: MarkerProps) {
  const beamRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const col = useMemo(() => new THREE.Color(color), [color])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = 0.35 + Math.sin(t * 2.2) * 0.25
    }
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + Math.sin(t * 1.8) * 0.18)
    }
  })

  return (
    <group position={position}>
      {/* Vertical beam */}
      <mesh ref={beamRef} position={[0, beamHeight / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.12, beamHeight, 8]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={2.5}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      {/* Pulsing ring at base */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[0.35, 0.55, 24]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={3}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Top orb */}
      <mesh position={[0, beamHeight + 0.3, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={3.5} />
      </mesh>
      {/* Label */}
      <Text
        position={[0, beamHeight + 1.0, 0]}
        fontSize={0.55}
        color={color}
        anchorX="center"
        anchorY="middle"
        font={undefined}
        characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /"
      >
        {label}
      </Text>
      {/* Point light glow */}
      <pointLight color={col} intensity={4} distance={8} decay={2} position={[0, beamHeight, 0]} />
    </group>
  )
}

// ── Marker terrain-height lookup ─────────────────────────────────────────────
function markerY(ix: number, iz: number): number {
  const h = getHeight(ix, iz)
  return Math.max(1, Math.round(h * 1.5 + 3)) * VOXEL_SIZE - 2 + 0.5
}

// ── Camera setup ─────────────────────────────────────────────────────────────
function CameraRig() {
  const { camera } = useThree()
  useMemo(() => {
    camera.position.set(28, 26, 28)
    camera.lookAt(0, 0, 0)
  }, [camera])
  return null
}

// ── Full scene ────────────────────────────────────────────────────────────────
interface MapSceneProps {
  reducedMotion: boolean
}

function MapScene({ reducedMotion }: MapSceneProps) {
  return (
    <>
      <CameraRig />
      <fog attach="fog" args={['#070707', 28, 70]} />

      {/* Lighting */}
      <ambientLight intensity={0.55} color="#1a0f14" />
      <directionalLight
        color="#FF6B3D"
        intensity={1.8}
        position={[20, 30, 10]}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight color="#4A7FBB" intensity={0.7} position={[-20, 10, -15]} />
      <pointLight color="#FF2B4F" intensity={6} distance={25} decay={2} position={[0, 12, 0]} />
      <pointLight color="#4A7FBB" intensity={3} distance={20} decay={2} position={[-12, 8, -12]} />

      {/* Terrain */}
      <Terrain />

      {/* Tactical markers — positioned at interesting terrain spots */}
      <TacticalMarker
        position={[(5 - GRID_W / 2) * VOXEL_SIZE, markerY(5, 8), (8 - GRID_D / 2) * VOXEL_SIZE]}
        label="SPAWN"
        color="#50C878"
        beamHeight={7}
      />
      <TacticalMarker
        position={[(26 - GRID_W / 2) * VOXEL_SIZE, markerY(26, 22), (22 - GRID_D / 2) * VOXEL_SIZE]}
        label="PVP ZONE"
        color="#FF2B4F"
        beamHeight={8}
      />
      <TacticalMarker
        position={[(14 - GRID_W / 2) * VOXEL_SIZE, markerY(14, 28), (28 - GRID_D / 2) * VOXEL_SIZE]}
        label="WARZONE"
        color="#F0A500"
        beamHeight={6}
      />

      {/* Drift particles for atmosphere */}
      <group position={[0, 5, 0]}>
        <DriftField count={30} color="#FF2B4F" />
      </group>

      {/* OrbitControls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.5}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={18}
        maxDistance={60}
      />
    </>
  )
}

// ── Exported component (rendered inside dynamic-loaded boundary) ──────────────
export default function MapWorld3D() {
  // Read prefers-reduced-motion safely (client-only component)
  const reducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#070707' }}
      camera={{ fov: 50, near: 0.5, far: 120 }}
    >
      <MapScene reducedMotion={reducedMotion} />
    </Canvas>
  )
}
