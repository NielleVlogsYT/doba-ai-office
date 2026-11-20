import type { Agent } from '../../../shared/config'

/** Hand-placed anchors for the five shipped desks. */
const ANCHORS: Record<string, [number, number]> = {
  grant: [-5.6, -2.3],
  mark: [0, -2.5],
  ichim: [5.6, -2.3],
  josh: [-3.2, 2.4],
  rex: [1.6, 2.2],
}

/** Where hired desks land once the anchors are taken. */
const OVERFLOW: Array<[number, number]> = [
  [-7.8, 0.1],
  [7.8, 0.3],
  [-7.9, 4.6],
  [7.9, 4.8],
  [0, 4.9],
  [-1.9, -4.5],
]

export const BOSS_SEAT: [number, number] = [6.7, 2.6]

export type Placement = { agent: Agent; home: [number, number]; index: number }

export function layout(agents: Agent[]): Placement[] {
  const used = new Set<string>()
  const placements: Placement[] = []
  let overflow = 0
  agents.forEach((agent, index) => {
    let home = ANCHORS[agent.id]
    if (!home) {
      while (overflow < OVERFLOW.length && used.has(OVERFLOW[overflow].join(','))) overflow += 1
      home = OVERFLOW[overflow] ?? [-6 + (index % 5) * 3, 4.6]
      overflow += 1
    }
    used.add(home.join(','))
    placements.push({ agent, home, index })
  })
  return placements
}
