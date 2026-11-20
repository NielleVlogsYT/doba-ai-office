import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls } from '@react-three/drei'
import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import * as THREE from 'three'

import type { Agent, AgentId } from '../../../shared/config'
import type { Decision, Task } from '../../../shared/types'
import { cx } from '../../lib/format'
import { presenceFor, type Presence } from '../../lib/presence'

/**
 * The office floor in 3D. Desks are static set dressing; the figures animate
 * their presence (working, thinking, waiting) and wander a little when idle.
 */

const SKIN = ['#c98a5f', '#e3a47b', '#d79a72', '#8a5a3b', '#b97a50', '#a9703f', '#6f4a33', '#dda57f']
const HAIR = ['#3a2a22', '#2b2430', '#3c2a21', '#211a1a', '#2e211b', '#4a3524']

import { BOSS_SEAT, layout } from './layout'

/** The boss desk shares the hover channel with agent ids. */
const BOSS_HOVER = '__boss'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Frames the whole floor, pulled back further on a narrow container. */
function Framing() {
  const { camera, size } = useThree()
  useEffect(() => {
    if (!size.width || !size.height) return
    const aspect = size.width / size.height
    const distance = aspect > 1.6 ? 17 : aspect > 1.1 ? 20 : aspect > 0.8 ? 24 : 27
    camera.position.set(0, distance * 0.52, distance)
    camera.lookAt(0, 2, -0.5)
  }, [camera, size.width, size.height])
  return null
}

function Window({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[5.4, 3.2, 0.12]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <planeGeometry args={[4.9, 2.8]} />
        <meshStandardMaterial color="#bfe0f2" />
      </mesh>
      <mesh position={[1.4, 0.55, 0.13]}>
        <circleGeometry args={[0.42, 28]} />
        <meshStandardMaterial color="#f6c445" />
      </mesh>
      <mesh position={[-1.1, 0.5, 0.13]}>
        <circleGeometry args={[0.3, 20]} />
        <meshStandardMaterial color="#fffdf6" />
      </mesh>
      <mesh position={[-1.5, 0.6, 0.14]}>
        <circleGeometry args={[0.24, 20]} />
        <meshStandardMaterial color="#fffdf6" />
      </mesh>
      <mesh position={[0, -1.1, 0.13]}>
        <planeGeometry args={[4.9, 0.5]} />
        <meshStandardMaterial color="#a7c0cb" />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <boxGeometry args={[0.08, 2.8, 0.04]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
      <mesh position={[0, 0.1, 0.14]}>
        <boxGeometry args={[4.9, 0.08, 0.04]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
    </group>
  )
}

function Whiteboard({ position }: { position: [number, number, number] }) {
  const notes: Array<[number, number, string, number]> = [
    [-0.9, 0.25, '#f6d47a', -0.1],
    [0.75, -0.35, '#f4b8a3', 0.12],
  ]
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[4.6, 2.4, 0.1]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <boxGeometry args={[4.4, 2.2, 0.02]} />
        <meshStandardMaterial color="#fffdf7" />
      </mesh>
      {[0.62, 0.28, -0.06].map((y, i) => (
        <mesh key={y} position={[-0.5, y, 0.09]}>
          <boxGeometry args={[2.6 - i * 0.5, 0.045, 0.01]} />
          <meshStandardMaterial color="#8a8499" />
        </mesh>
      ))}
      <mesh position={[-1.55, 0.85, 0.09]}>
        <boxGeometry args={[0.9, 0.09, 0.01]} />
        <meshStandardMaterial color="#242033" />
      </mesh>
      {notes.map(([x, y, color, tilt]) => (
        <mesh key={color} position={[x, y, 0.1]} rotation={[0, 0, tilt]}>
          <planeGeometry args={[0.62, 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  )
}

function Clock({ position, now }: { position: [number, number, number]; now: number }) {
  const date = new Date(now)
  const hour = ((date.getHours() % 12) + date.getMinutes() / 60) * 30
  const minute = date.getMinutes() * 6
  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[0.72, 32]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[0.63, 32]} />
        <meshStandardMaterial color="#fffdf7" />
      </mesh>
      <mesh position={[0, 0, 0.05]} rotation={[0, 0, THREE.MathUtils.degToRad(-hour)]}>
        <boxGeometry args={[0.06, 0.42, 0.02]} />
        <meshStandardMaterial color="#242033" />
      </mesh>
      <mesh position={[0, 0, 0.06]} rotation={[0, 0, THREE.MathUtils.degToRad(-minute)]}>
        <boxGeometry args={[0.04, 0.56, 0.02]} />
        <meshStandardMaterial color="#242033" />
      </mesh>
    </group>
  )
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.42, 0.32, 0.84, 16]} />
        <meshStandardMaterial color="#f2b837" />
      </mesh>
      <mesh position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.46, 16, 14]} />
        <meshStandardMaterial color="#4e8b46" />
      </mesh>
      <mesh position={[0.26, 1.58, 0]}>
        <sphereGeometry args={[0.32, 14, 12]} />
        <meshStandardMaterial color="#5a9b52" />
      </mesh>
      <mesh position={[-0.3, 1.55, 0.1]}>
        <sphereGeometry args={[0.28, 14, 12]} />
        <meshStandardMaterial color="#3f7739" />
      </mesh>
    </group>
  )
}

function Loose({ agent }: { agent: Agent }) {
  const toneColor = '#242033'
  return (
    <group position={[0.62, 0.02, 0.5]}>
      <mesh rotation={[-Math.PI / 2, 0, 0.4]}>
        <circleGeometry args={[0.18, 16]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.4]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.07, 0.12, 16]} />
        <meshStandardMaterial color={agent.color} />
      </mesh>
      <mesh position={[-0.02, 0.01, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, 0.02]} />
        <meshStandardMaterial color={toneColor} />
      </mesh>
    </group>
  )
}

function DeskSurface({ tint = '#d9a76b' }: { tint?: string }) {
  return (
    <group>
      <mesh position={[0, 0.94, 0.16]}>
        <boxGeometry args={[2.6, 0.12, 1.2]} />
        <meshStandardMaterial color={tint} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.46, 0.16]}>
        <boxGeometry args={[2.32, 0.07, 1.0]} />
        <meshStandardMaterial color="#c89458" roughness={0.9} />
      </mesh>
      {([
        [-1.14, 0.16],
        [1.14, 0.16],
        [-1.14, -0.34],
        [1.14, -0.34],
      ] as Array<[number, number]>).map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.45, z]}>
          <boxGeometry args={[0.12, 0.9, 0.12]} />
          <meshStandardMaterial color="#a97842" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-0.72, 1.02, 0.22]}>
        <boxGeometry args={[0.14, 0.05, 0.14]} />
        <meshStandardMaterial color="#2b2740" />
      </mesh>
      <mesh position={[-0.72, 1.28, 0.24]} rotation={[-0.16, 0.22, 0]}>
        <boxGeometry args={[0.92, 0.58, 0.05]} />
        <meshStandardMaterial color="#2b2740" />
      </mesh>
      <mesh position={[-0.72, 1.28, 0.27]} rotation={[-0.16, 0.22, 0]}>
        <boxGeometry args={[0.82, 0.48, 0.01]} />
        <meshStandardMaterial color="#1b1829" emissive="#2f6e67" emissiveIntensity={0.16} />
      </mesh>
    </group>
  )
}

function Mug({ color }: { color: string }) {
  return (
    <group position={[0.86, 1.0, 0.3]}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.11, 0.24, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0.14, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.025, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  )
}

function Figure({
  agent,
  presence,
  seat,
  index,
  reduced,
}: {
  agent: Agent
  presence: Presence
  seat: [number, number]
  index: number
  reduced: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const arms = useRef<THREE.Group>(null)
  const phase = useMemo(() => (index * 1.7) % (Math.PI * 2), [index])
  const skin = SKIN[index % SKIN.length]
  const hair = HAIR[index % HAIR.length]

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    // Reduced motion: sit perfectly still at the seat, arms resting on the desk.
    if (reduced) {
      node.position.set(seat[0], 0, seat[1])
      arms.current?.children.forEach((child) => {
        child.rotation.x = -0.55
      })
      return
    }
    const t = state.clock.elapsedTime
    const busy = presence.kind === 'working' || presence.kind === 'thinking'
    // Idle desks drift around their chair; busy ones plant and type.
    const drift = busy || presence.kind === 'waiting' ? 0 : 1
    const targetX = seat[0] + Math.sin(t * 0.24 + phase) * 0.5 * drift
    const targetZ = seat[1] + Math.cos(t * 0.19 + phase) * 0.34 * drift
    node.position.x = THREE.MathUtils.damp(node.position.x, targetX, 2.4, delta)
    node.position.z = THREE.MathUtils.damp(node.position.z, targetZ, 2.4, delta)
    node.position.y =
      presence.kind === 'waiting'
        ? Math.abs(Math.sin(t * 2.6)) * 0.05
        : busy
          ? Math.sin(t * 8.4) * 0.012
          : Math.sin(t * 1.1 + phase) * 0.008

    if (arms.current) {
      const swing = busy ? Math.sin(t * 8.4) * 0.34 : Math.sin(t * 1.2 + phase) * 0.05
      arms.current.children.forEach((child, armIndex) => {
        child.rotation.x = -0.55 + (armIndex === 0 ? swing : -swing)
      })
    }
  })

  return (
    <group ref={group} position={[seat[0], 0, seat[1]]}>
      {/* chair back */}
      <mesh position={[0, 0.66, -0.4]}>
        <boxGeometry args={[0.78, 0.98, 0.16]} />
        <meshStandardMaterial color="#473e63" roughness={0.85} />
      </mesh>
      {/* body */}
      <mesh position={[0, 1.04, 0]}>
        <capsuleGeometry args={[0.26, 0.5, 6, 16]} />
        <meshStandardMaterial color={agent.color} roughness={0.72} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.24, 24, 20]} />
        <meshStandardMaterial color={skin} roughness={0.65} />
      </mesh>
      {/* hair cap */}
      <mesh position={[0, 1.75, -0.01]}>
        <sphereGeometry args={[0.245, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hair} roughness={0.95} />
      </mesh>
      {/* eyes */}
      <mesh position={[-0.09, 1.67, 0.21]}>
        <sphereGeometry args={[0.032, 10, 8]} />
        <meshStandardMaterial color="#242033" />
      </mesh>
      <mesh position={[0.09, 1.67, 0.21]}>
        <sphereGeometry args={[0.032, 10, 8]} />
        <meshStandardMaterial color="#242033" />
      </mesh>
      {/* arms */}
      <group ref={arms} position={[0, 1.28, 0]}>
        <mesh position={[-0.32, -0.2, 0.1]}>
          <capsuleGeometry args={[0.085, 0.34, 4, 10]} />
          <meshStandardMaterial color={agent.color} roughness={0.72} />
        </mesh>
        <mesh position={[0.32, -0.2, 0.1]}>
          <capsuleGeometry args={[0.085, 0.34, 4, 10]} />
          <meshStandardMaterial color={agent.color} roughness={0.72} />
        </mesh>
      </group>
      {/* hands */}
      <mesh position={[-0.3, 0.98, 0.19]}>
        <sphereGeometry args={[0.085, 12, 10]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0.3, 0.98, 0.19]}>
        <sphereGeometry args={[0.085, 12, 10]} />
        <meshStandardMaterial color={skin} />
      </mesh>

      <Html position={[0, 2.16, 0]} center distanceFactor={11} zIndexRange={[24, 0]} style={{ pointerEvents: 'none' }}>
        <div className={cx('tag3d', `tag3d-${presence.kind}`)}>
          <span className="tag3d-name">{agent.name}</span>
          <span className="tag3d-status">{presence.label}</span>
        </div>
      </Html>
    </group>
  )
}

function AgentStation({
  agent,
  presence,
  home,
  index,
  reduced,
  hovered,
  onOpen,
}: {
  agent: Agent
  presence: Presence
  home: [number, number]
  index: number
  reduced: boolean
  hovered: boolean
  onOpen: (id: AgentId) => void
}) {
  const seat: [number, number] = [home[0], home[1] - 0.46]

  return (
    <group position={[home[0], 0, home[1]]}>
      {/* R3F only raycasts objects that carry the handlers themselves (a group has no
          geometry), so the click targets a real volume over the whole workstation. It
          carries the desk id so the hover raycast can name what it hit. */}
      <mesh
        position={[0, 1.15, 0.1]}
        userData={{ hoverId: agent.id }}
        onClick={(event) => {
          event.stopPropagation()
          onOpen(agent.id)
        }}
      >
        <boxGeometry args={[2.7, 2.4, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group scale={hovered ? 1.04 : 1}>
        <DeskSurface />
      </group>
      <Mug color={agent.color} />
      <Loose agent={agent} />
      <Figure agent={agent} presence={presence} seat={[seat[0] - home[0], seat[1] - home[1]]} index={index} reduced={reduced} />
      <Html position={[0, 0.74, 0.66]} center distanceFactor={13} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="plate3d">
          <b>{agent.name}</b>
          <i>{agent.desk}</i>
        </div>
      </Html>
      {presence.kind === 'waiting' && (
        <Html position={[0.46, 2.5, 0]} center distanceFactor={11} zIndexRange={[26, 0]} style={{ pointerEvents: 'none' }}>
          <span className="ask3d" aria-hidden>
            !
          </span>
        </Html>
      )}
    </group>
  )
}

function BossStation({
  pending,
  hovered,
  onOpen,
}: {
  pending: number
  hovered: boolean
  onOpen: () => void
}) {
  return (
    <group position={[BOSS_SEAT[0], 0, BOSS_SEAT[1]]}>
      <mesh
        position={[0, 1.15, 0.1]}
        userData={{ hoverId: BOSS_HOVER }}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
      >
        <boxGeometry args={[2.7, 2.4, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group scale={hovered ? 1.04 : 1}>
        <DeskSurface tint="#e0b073" />
      </group>
      {/* empty boss chair */}
      <mesh position={[0, 0.72, -0.52]}>
        <boxGeometry args={[0.92, 1.16, 0.2]} />
        <meshStandardMaterial color="#e8b33a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.28, -0.52]}>
        <boxGeometry args={[0.98, 0.16, 0.5]} />
        <meshStandardMaterial color="#d9a62f" roughness={0.8} />
      </mesh>
      {/* in-tray */}
      <mesh position={[0.72, 1.04, 0.1]}>
        <boxGeometry args={[0.62, 0.12, 0.44]} />
        <meshStandardMaterial color="#c89458" />
      </mesh>
      <mesh position={[0.72, 1.12, 0.1]}>
        <boxGeometry args={[0.5, 0.05, 0.34]} />
        <meshStandardMaterial color="#fbf7ec" />
      </mesh>
      {/* approval stamp */}
      <group position={[-0.85, 1.2, 0.28]} rotation={[0, 0, 0.2]}>
        <mesh>
          <boxGeometry args={[0.2, 0.42, 0.2]} />
          <meshStandardMaterial color="#f2b837" />
        </mesh>
        <mesh position={[0, -0.24, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.06, 18]} />
          <meshStandardMaterial color="#242033" />
        </mesh>
      </group>
      <Html position={[0, 0.76, 0.66]} center distanceFactor={13} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="plate3d plate3d-boss">
          <b>You</b>
          <i>the boss</i>
        </div>
      </Html>
      <Html position={[0, 2.2, 0]} center distanceFactor={11} zIndexRange={[24, 0]} style={{ pointerEvents: 'none' }}>
        <div className={cx('tag3d', pending > 0 ? 'tag3d-waiting' : 'tag3d-idle')}>
          <span className="tag3d-name">Your chair</span>
          <span className="tag3d-status">{pending === 0 ? 'desk is clear' : `${pending} waiting`}</span>
        </div>
      </Html>
      {pending > 0 && (
        <Html position={[0.5, 2.62, 0]} center distanceFactor={11} zIndexRange={[26, 0]} style={{ pointerEvents: 'none' }}>
          <span className="ask3d" aria-hidden>
            {pending}
          </span>
        </Html>
      )}
    </group>
  )
}

function Room({ now }: { now: number }) {
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]}>
        <planeGeometry args={[26, 18]} />
        <meshStandardMaterial color="#e9cd9b" roughness={0.95} />
      </mesh>
      {/* rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.6]}>
        <circleGeometry args={[6.4, 48]} />
        <meshStandardMaterial color="#b7a6d6" transparent opacity={0.28} />
      </mesh>
      {/* back wall */}
      <mesh position={[0, 3.2, -6.9]}>
        <planeGeometry args={[26, 8]} />
        <meshStandardMaterial color="#c3dbd3" />
      </mesh>
      <mesh position={[0, 0.9, -6.86]}>
        <planeGeometry args={[26, 1.8]} />
        <meshStandardMaterial color="#b8d2c9" />
      </mesh>

      <Window position={[-7.4, 3.4, -6.78]} />
      <Whiteboard position={[6.4, 3.6, -6.78]} />
      <Clock position={[-2.6, 4.3, -6.76]} now={now} />
      <Plant position={[-9.6, 0, -4.6]} />
      <Plant position={[9.8, 0, -5.2]} />

      {/* boss plaque on the wall */}
      <group position={[2.6, 3.5, -6.76]}>
        <mesh>
          <boxGeometry args={[1.5, 1.1, 0.08]} />
          <meshStandardMaterial color="#f2b837" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[1.3, 0.92]} />
          <meshStandardMaterial color="#fbf7ec" />
        </mesh>
        <Html position={[0, 0, 0.1]} center distanceFactor={12} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className="plaque3d">the boss</span>
        </Html>
      </group>

      {/* pendant lamp */}
      <mesh position={[0, 6.2, 0.4]}>
        <cylinderGeometry args={[0.02, 0.02, 2.2, 8]} />
        <meshStandardMaterial color="#242033" />
      </mesh>
      <mesh position={[0, 5.05, 0.4]}>
        <coneGeometry args={[0.72, 0.66, 24, 1, true]} />
        <meshStandardMaterial color="#f2b837" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.72, 0.4]}>
        <sphereGeometry args={[0.16, 14, 12]} />
        <meshStandardMaterial color="#fff4c8" emissive="#fff4c8" emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, 4.5, 0.4]} intensity={22} distance={12} color="#ffe9b0" />
    </group>
  )
}

/**
 * Resolves which workstation the cursor is over. Measured here: clicks reach the canvas
 * but no pointermove does, and R3F derives its hover from canvas pointermove, so its own
 * hover never received an event and stays unverified. This listens for the move itself
 * and raycasts the same hit volumes the clicks land on, so exactly the desk that would
 * open is the one that lights up. The answer is computed inside the event, not in a frame
 * loop, so it still holds while the tab is hidden and nothing is being painted.
 */
function HoverHit({ onHover }: { onHover: (id: string | null) => void }) {
  const { camera, gl, scene } = useThree()
  const current = useRef<string | null>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  useEffect(() => {
    const canvas = gl.domElement
    const spot = new THREE.Vector2()

    // Re-rendering on every move would be waste; only a change of desk is news.
    const apply = (id: string | null) => {
      if (current.current === id) return
      current.current = id
      onHover(id)
    }

    const resolve = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      spot.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      )
      raycaster.setFromCamera(spot, camera)
      // Everything else in the room is scenery; only tagged hit volumes answer for hover.
      const hit = raycaster.intersectObjects(scene.children, true).find(({ object }) => object.userData.hoverId)
      apply(hit?.object.userData.hoverId ?? null)
    }

    // One signal tears both listeners down, so neither can outlive the component.
    const abort = new AbortController()
    canvas.addEventListener('pointermove', resolve, { signal: abort.signal })
    canvas.addEventListener('pointerleave', () => apply(null), { signal: abort.signal })
    return () => abort.abort()
  }, [camera, gl, onHover, raycaster, scene])

  return null
}

function FloorScene({
  agents,
  tasks,
  decisions,
  typing,
  now,
  hoveredId,
  onHover,
  onOpenAgent,
  onOpenDecisions,
}: {
  agents: Agent[]
  tasks: Task[]
  decisions: Decision[]
  typing: AgentId | null
  now: number
  hoveredId: string | null
  onHover: (id: string | null) => void
  onOpenAgent: (id: AgentId) => void
  onOpenDecisions: () => void
}) {
  const reduced = useReducedMotion()
  const placements = useMemo(() => layout(agents), [agents])
  const pending = decisions.filter((decision) => decision.status === 'pending').length

  return (
    <>
      <color attach="background" args={['#d3e7f2']} />
      <Framing />
      <ambientLight intensity={1.05} />
      <hemisphereLight args={['#ffffff', '#d8c49a', 1.1]} />
      <directionalLight position={[6, 12, 9]} intensity={1.5} />
      <directionalLight position={[-8, 7, 4]} intensity={0.5} color="#cfe4ef" />

      <Room now={now} />
      <HoverHit onHover={onHover} />

      {placements.map(({ agent, home, index }) => (
        <AgentStation
          key={agent.id}
          agent={agent}
          home={home}
          index={index}
          reduced={reduced}
          hovered={hoveredId === agent.id}
          presence={presenceFor(agent, { tasks, decisions, typing })}
          onOpen={onOpenAgent}
        />
      ))}

      <BossStation pending={pending} hovered={hoveredId === BOSS_HOVER} onOpen={onOpenDecisions} />

      <ContactShadows position={[0, 0.02, 0]} scale={30} blur={2.6} opacity={0.34} far={7} />

      <OrbitControls
        makeDefault
        enablePan={false}
        // Damping glides the camera after you let go; reduced motion wants the view
        // to land where you drop it.
        enableDamping={!reduced}
        dampingFactor={0.08}
        target={[0, 1.6, -0.4]}
        minDistance={10}
        maxDistance={38}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.08}
      />
    </>
  )
}

type Props = {
  agents: Agent[]
  tasks: Task[]
  decisions: Decision[]
  typing: AgentId | null
  now: number
  onOpenAgent: (id: AgentId) => void
  onOpenDecisions: () => void
}

/** A WebGL failure must not take the rest of the office down with it. */
class OfficeBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('office3d failed', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="office3d-error">
          <strong>The 3D floor could not start.</strong>
          <span>{this.state.error.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}

export function Office3D({ agents, tasks, decisions, typing, now, onOpenAgent, onOpenDecisions }: Props) {
  // The canvas only configures once its container measures above zero, and that
  // measurement rides on ResizeObserver — which some browsers drop while a window is
  // occluded or throttled, leaving a dead 300x150 canvas. A resize event forces a
  // synchronous re-measure, so the floor appears the moment the container is laid out.
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'))
    nudge()
    const raf = window.requestAnimationFrame(nudge)
    const timers = [120, 400, 1200].map((ms) => window.setTimeout(nudge, ms))
    return () => {
      window.cancelAnimationFrame(raf)
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hoveredId])

  return (
    <section className="office3d" aria-label="The office floor">
      <OfficeBoundary>
        <Canvas
          dpr={[1, 1.8]}
          camera={{ fov: 40, position: [0, 8, 14], near: 0.1, far: 120 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          resize={{ offsetSize: true, debounce: 0 }}
          style={{ width: '100%', height: '100%' }}
        >
          <FloorScene
            agents={agents}
            tasks={tasks}
            decisions={decisions}
            typing={typing}
            now={now}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onOpenAgent={onOpenAgent}
            onOpenDecisions={onOpenDecisions}
          />
        </Canvas>
      </OfficeBoundary>

      <p className="office3d-hint">Drag to look · click a desk to open it</p>

      {/* The canvas is not tabbable, so the same desks exist as real buttons. */}
      <ul className="sr-only">
        {agents.map((agent) => (
          <li key={agent.id}>
            <button onClick={() => onOpenAgent(agent.id)}>
              Open {agent.name}, {agent.title}
            </button>
          </li>
        ))}
        <li>
          <button onClick={onOpenDecisions}>Open your decision desk</button>
        </li>
      </ul>
    </section>
  )
}
