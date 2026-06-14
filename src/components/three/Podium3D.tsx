'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Text } from '@react-three/drei'
import * as THREE from 'three'
import { DriftField } from './voxel'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PodiumPlayer {
  name: string
  value: string
  color: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MEDAL = {
  // яркий emissive металл медали
  metal:   ['#FFD700', '#D8DCE2', '#CD7F32'] as const,
  // тёмный корпус тумбы
  pillar:  ['#241a05', '#16171a', '#1f1206'] as const,
  // подсветка кромок/трима
  trim:    ['#FFE34D', '#EAEEF5', '#E8954A'] as const,
}

const NUMERAL = ['1', '2', '3']
const PILLAR_HEIGHTS = [3.3, 2.1, 1.5] // #1 центр, #2 лево, #3 право
const SLOT_ORDER = [1, 0, 2]           // индексы в top3: лево=серебро, центр=золото, право=бронза
const X_POSITIONS = [-2.35, 0, 2.35]

const FLOOR_Y = -1.7

// ─── Парящая медаль-диск над тумбой ────────────────────────────────────────────

function Medal({ rank, y, reducedMotion }: { rank: number; y: number; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const metal = MEDAL.metal[rank]

  useFrame((state) => {
    if (reducedMotion || !ref.current) return
    const t = state.clock.elapsedTime
    ref.current.position.y = y + Math.sin(t * 1.3) * 0.1
    ref.current.rotation.y = t * 0.9
  })

  return (
    <group ref={ref} position={[0, y, 0]}>
      {/* диск-монета (ось повёрнута, чтобы смотрела вперёд) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 40]} />
        <meshBasicMaterial color={metal} />
      </mesh>
      {/* номер на медали */}
      <Text position={[0, 0, 0.07]} fontSize={0.42} color="#1a1205" anchorX="center" anchorY="middle">
        {NUMERAL[rank]}
      </Text>
    </group>
  )
}

// ─── Тумба пьедестала ──────────────────────────────────────────────────────────

function Pillar({ rank, xPos, reducedMotion }: { rank: number; xPos: number; reducedMotion: boolean }) {
  const height = PILLAR_HEIGHTS[rank]
  const yBody = FLOOR_Y + height / 2
  const top = FLOOR_Y + height
  const metal = MEDAL.metal[rank]
  const pillarColor = MEDAL.pillar[rank]
  const trim = MEDAL.trim[rank]

  return (
    <group position={[xPos, 0, 0]}>
      {/* нижняя ступень-цоколь (шире) */}
      <RoundedBox args={[2.0, 0.35, 2.0]} radius={0.05} smoothness={3} position={[0, FLOOR_Y + 0.175, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={pillarColor} roughness={0.45} metalness={0.7} />
      </RoundedBox>

      {/* корпус тумбы со скруглением */}
      <RoundedBox args={[1.6, height - 0.35, 1.6]} radius={0.08} smoothness={4} position={[0, yBody + 0.175, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={pillarColor} emissive={metal} emissiveIntensity={0.06} roughness={0.35} metalness={0.85} />
      </RoundedBox>

      {/* светящаяся верхняя крышка-кант */}
      <RoundedBox args={[1.72, 0.12, 1.72]} radius={0.04} smoothness={3} position={[0, top, 0]}>
        <meshStandardMaterial color={trim} emissive={trim} emissiveIntensity={1.1} roughness={0.15} metalness={1} />
      </RoundedBox>

      {/* вертикальные неоновые канты по передним рёбрам */}
      {[-0.81, 0.81].map((x) => (
        <mesh key={x} position={[x, yBody + 0.175, 0.81]}>
          <boxGeometry args={[0.04, height - 0.5, 0.04]} />
          <meshStandardMaterial color={trim} emissive={trim} emissiveIntensity={0.9} />
        </mesh>
      ))}

      {/* крупный номер на фасаде тумбы */}
      <Text
        position={[0, yBody + 0.175, 0.82]}
        fontSize={height * 0.42}
        color={metal}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#000000"
      >
        {NUMERAL[rank]}
      </Text>

      {/* медаль */}
      <Medal rank={rank} y={top + 1.05} reducedMotion={reducedMotion} />
    </group>
  )
}

// ─── Сцена ──────────────────────────────────────────────────────────────────────

function PodiumScene({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (reducedMotion || !groupRef.current) return
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.16
  })

  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      <fog attach="fog" args={['#070707', 11, 32]} />

      {/* свет */}
      <ambientLight intensity={0.4} color="#20202e" />
      <directionalLight position={[4, 7, 4]} intensity={1.0} color="#fff6dd" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 6, 5]} color="#FFD700" intensity={28} distance={20} decay={2} />
      <pointLight position={[-6, 2, 3]} color="#FF2B4F" intensity={14} distance={16} decay={2} />
      <pointLight position={[6, 1, 3]} color="#4A7FBB" intensity={10} distance={16} decay={2} />

      {/* пол-платформа */}
      <mesh position={[0, FLOOR_Y - 0.06, 0]} receiveShadow>
        <boxGeometry args={[9, 0.12, 3.4]} />
        <meshStandardMaterial color="#0d0407" roughness={0.55} metalness={0.6} />
      </mesh>
      {/* светящаяся кромка пола */}
      <mesh position={[0, FLOOR_Y + 0.005, 0]}>
        <boxGeometry args={[9, 0.04, 3.4]} />
        <meshStandardMaterial color="#FF2B4F" emissive="#FF2B4F" emissiveIntensity={0.45} roughness={0.2} metalness={0.85} />
      </mesh>

      {/* тумбы */}
      {SLOT_ORDER.map((rank, slotIdx) => (
        <Pillar key={rank} rank={rank} xPos={X_POSITIONS[slotIdx]} reducedMotion={reducedMotion} />
      ))}

      <DriftField count={26} color="#FFD700" />
    </group>
  )
}

// ─── Экспорт ──────────────────────────────────────────────────────────────────

export interface Podium3DProps {
  top3: PodiumPlayer[]
  reducedMotion?: boolean
}

export default function Podium3D({ top3, reducedMotion = false }: Podium3DProps) {
  const MEDAL_LABELS = ['ЗОЛОТО', 'СЕРЕБРО', 'БРОНЗА']
  const MEDAL_EDGE = ['#FFD700', '#C8CCD2', '#CD7F32']
  const displayOrder = [1, 0, 2]

  return (
    <div style={{ position: 'relative', width: '100%', height: 300 }}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.6, 8.5], fov: 42 }} gl={{ antialias: true, alpha: true }} style={{ width: '100%', height: '100%' }}>
        <PodiumScene reducedMotion={reducedMotion} />
      </Canvas>

      {/* HTML-подписи под тумбами */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-around',
          paddingBottom: 8, paddingLeft: '6%', paddingRight: '6%',
          pointerEvents: 'none',
        }}
      >
        {displayOrder.map((rank) => {
          const p = top3[rank]
          if (!p) return <div key={rank} style={{ flex: 1 }} />
          const edge = MEDAL_EDGE[rank]
          return (
            <div key={rank} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, letterSpacing: '0.3em', color: edge, textTransform: 'uppercase' }}>
                {MEDAL_LABELS[rank]}
              </div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 13, letterSpacing: '0.08em', color: '#fff', textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>
                {p.value}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
