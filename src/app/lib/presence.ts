import type { Agent, AgentId } from '../../shared/config'
import type { Decision, Task } from '../../shared/types'

export type PresenceKind = 'working' | 'thinking' | 'waiting' | 'idle'

export type Presence = {
  kind: PresenceKind
  /** Short label for the floor badge. */
  label: string
  /** The longer line, used in the drawer and the roster. */
  detail: string
}

type Input = {
  tasks: Task[]
  decisions: Decision[]
  typing: AgentId | null
}

/**
 * What a desk is doing right now. Waiting beats working: if something sits on
 * the boss's desk, that is the most useful thing to show.
 */
export function presenceFor(agent: Agent, { tasks, decisions, typing }: Input): Presence {
  const asked = decisions.find((decision) => decision.status === 'pending' && decision.agentId === agent.id)
  if (asked) return { kind: 'waiting', label: 'Needs a stamp', detail: asked.title }

  if (typing === agent.id) return { kind: 'thinking', label: 'Thinking…', detail: `${agent.name} is writing a reply.` }

  const working = tasks.find((task) => task.agentId === agent.id && task.status === 'working')
  if (working) return { kind: 'working', label: 'On it', detail: working.brief }

  const review = tasks.find((task) => task.agentId === agent.id && task.status === 'review')
  if (review) return { kind: 'waiting', label: 'Filed for review', detail: review.brief }

  return { kind: 'idle', label: agent.idle, detail: `${agent.name} is between jobs.` }
}

/** Idle desks, in floor order — who a standup should ask first. */
export function idleDesks(agents: Agent[], input: Input): Agent[] {
  return agents.filter((agent) => presenceFor(agent, input).kind === 'idle')
}
