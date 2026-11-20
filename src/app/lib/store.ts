import type { Agent, AgentId } from '../../shared/config'
import type {
  ChatMessage,
  Decision,
  DecisionAudit,
  DecisionStatus,
  OfficeEvent,
  OfficeState,
  Task,
} from '../../shared/types'
import { tidyGreeting } from './roster'

// v2: desks can be hired, so threads are keyed by any desk id and the roster
// can grow. Old v1 state is abandoned rather than half-migrated.
const STORAGE_KEY = 'bullpen.office.v2'

export function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}`
}

const greetingFor = (agent: Agent): ChatMessage => ({
  id: makeId('m'),
  from: 'agent',
  text: agent.greeting,
  at: Date.now(),
})

export function freshState(agents: Agent[]): OfficeState {
  const openedAt = Date.now()
  const threads: Record<string, ChatMessage[]> = {}
  for (const agent of agents) threads[agent.id] = [{ ...greetingFor(agent), at: openedAt }]
  return {
    version: 1,
    threads,
    tasks: [],
    decisions: [],
    events: [{ id: makeId('e'), at: openedAt, text: 'Office opened. Five desks, one boss.', tone: 'open' }],
    openedAt,
  }
}

export function loadState(agents: Agent[]): OfficeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshState(agents)
    const parsed = JSON.parse(raw) as OfficeState
    if (parsed?.version !== 1 || !parsed.threads || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.decisions)) {
      return freshState(agents)
    }
    // A desk hired since the last visit needs a thread; a removed one is dropped.
    const threads: Record<string, ChatMessage[]> = {}
    for (const agent of agents) {
      const saved = parsed.threads[agent.id]
      const opened = Array.isArray(saved) && saved.length > 0 ? saved : [greetingFor(agent)]
      // Repair greeting messages saved before the seat-name fix ("Copy desk desk").
      threads[agent.id] = opened.map((message, index) =>
        index === 0 && message.from === 'agent' ? { ...message, text: tidyGreeting(message.text) } : message,
      )
    }
    // Decisions saved before desks could self-approve belong to the boss.
    const decisions = parsed.decisions.map((decision) => ({ ...decision, reviewer: decision.reviewer ?? 'boss' }))
    return { ...parsed, threads, decisions }
  } catch {
    return freshState(agents)
  }
}

/**
 * Browsers give an origin roughly 5 million characters. Stopping short of that leaves
 * room for one more save, so the office prunes on its own terms instead of hitting a
 * quota error mid-write and losing the newest work.
 */
export const STORAGE_BUDGET = 3_500_000

/** A data URL is megabytes of base64: the visit keeps the preview, storage keeps the text. */
function persisted(state: OfficeState): OfficeState {
  const threads = Object.fromEntries(
    Object.entries(state.threads).map(([agentId, messages]) => [
      agentId,
      messages.map((message) =>
        message.attachments?.some((file) => file.src)
          ? {
              ...message,
              attachments: message.attachments.map(({ id, name, kind, mime, size, text }) => ({ id, name, kind, mime, size, text })),
            }
          : message,
      ),
    ]),
  )
  return { ...state, threads }
}

const sizeOf = (state: OfficeState) => JSON.stringify(persisted(state)).length

type Prune = (state: OfficeState) => { state: OfficeState; dropped: number }

const keepMessages = (limit: number): Prune => (state) => {
  let dropped = 0
  const threads = Object.fromEntries(
    Object.entries(state.threads).map(([agentId, messages]) => {
      if (messages.length <= limit) return [agentId, messages]
      dropped += messages.length - limit
      return [agentId, messages.slice(-limit)]
    }),
  )
  return dropped ? { state: { ...state, threads }, dropped } : { state, dropped: 0 }
}

const keepEvents = (limit: number): Prune => (state) => {
  const events = state.events.slice(0, limit)
  return events.length === state.events.length
    ? { state, dropped: 0 }
    : { state: { ...state, events }, dropped: state.events.length - events.length }
}

/** Tasks are newest-first, so the tail goes; anything a pending decision points at stays. */
const keepTasks = (limit: number): Prune => (state) => {
  const held = new Set(state.decisions.filter((d) => d.status === 'pending').map((d) => d.taskId))
  const tasks = state.tasks.filter((task, index) => index < limit || held.has(task.id))
  return tasks.length === state.tasks.length
    ? { state, dropped: 0 }
    : { state: { ...state, tasks }, dropped: state.tasks.length - tasks.length }
}

/** The trail is the point, so pending calls and the newest records always survive. */
const keepDecisions = (limit: number): Prune => (state) => {
  const decisions = state.decisions.filter((decision, index) => index < limit || decision.status === 'pending')
  return decisions.length === state.decisions.length
    ? { state, dropped: 0 }
    : { state: { ...state, decisions }, dropped: state.decisions.length - decisions.length }
}

/**
 * Escalating cuts: chat history first, then the ledger, then older filed work. Chat is
 * dropped last to a single message before a pending or recent call is ever touched.
 */
const PRUNE_STEPS: Prune[] = [
  keepMessages(40),
  keepEvents(30),
  keepTasks(30),
  keepMessages(20),
  keepDecisions(40),
  keepMessages(10),
  keepTasks(12),
  keepDecisions(20),
  keepEvents(10),
  keepMessages(5),
  keepTasks(6),
  keepDecisions(10),
  keepMessages(1),
]

/** Shrinks the office until it fits the budget, or until there is nothing left to drop. */
export function pruneToBudget(state: OfficeState, budget = STORAGE_BUDGET): { state: OfficeState; dropped: number } {
  let next = state
  let dropped = 0
  for (const step of PRUNE_STEPS) {
    if (sizeOf(next) <= budget) break
    const result = step(next)
    next = result.state
    dropped += result.dropped
  }
  return { state: next, dropped }
}

export type SaveOutcome = {
  /** The office as it was actually written — adopt it so the screen matches storage. */
  state: OfficeState
  size: number
  /** How many records had to be dropped to fit. */
  pruned: number
  /** True when even a fully pruned office would not fit. */
  failed: boolean
}

export function saveState(state: OfficeState): SaveOutcome {
  const fitted = pruneToBudget(state)
  let next = fitted.state
  let pruned = fitted.dropped

  const write = (candidate: OfficeState) => localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted(candidate)))

  try {
    write(next)
    return { state: next, size: sizeOf(next), pruned, failed: false }
  } catch {
    // The browser's own limit is tighter than the budget: cut everything we can, retrying
    // after each step, and only report failure once nothing is left to give.
    for (const step of PRUNE_STEPS) {
      const result = step(next)
      if (result.dropped === 0) continue
      next = result.state
      pruned += result.dropped
      try {
        write(next)
        return { state: next, size: sizeOf(next), pruned, failed: false }
      } catch {
        // keep cutting
      }
    }
    return { state: next, size: sizeOf(next), pruned, failed: true }
  }
}

export type Action =
  | { type: 'add-message'; agentId: AgentId; message: ChatMessage }
  | { type: 'add-task'; task: Task }
  | { type: 'patch-task'; id: string; patch: Partial<Task> }
  | { type: 'add-decision'; decision: Decision }
  | { type: 'resolve-decision'; id: string; status: Exclude<DecisionStatus, 'pending'> }
  | { type: 'hand-to-boss'; id: string; note: string }
  | { type: 'audit-decision'; id: string; audit: DecisionAudit }
  | { type: 'reopen-decision'; id: string; audit?: DecisionAudit }
  /** Adopt the pruned office that was actually written to storage. */
  | { type: 'replace-state'; state: OfficeState }
  | { type: 'add-event'; event: OfficeEvent }
  | { type: 'reset-agent'; agentId: AgentId; agent: Agent }
  | { type: 'forget-agent'; agentId: AgentId }

export function reducer(state: OfficeState, action: Action): OfficeState {
  switch (action.type) {
    case 'replace-state':
      return action.state
    case 'add-message':
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.agentId]: [...(state.threads[action.agentId] ?? []), action.message],
        },
      }
    case 'add-task':
      return { ...state, tasks: [action.task, ...state.tasks] }
    case 'patch-task':
      return { ...state, tasks: state.tasks.map((task) => (task.id === action.id ? { ...task, ...action.patch } : task)) }
    case 'add-decision':
      return { ...state, decisions: [action.decision, ...state.decisions] }
    case 'resolve-decision':
      return {
        ...state,
        decisions: state.decisions.map((decision) =>
          decision.id === action.id ? { ...decision, status: action.status, resolvedAt: Date.now() } : decision,
        ),
      }
    case 'audit-decision':
      // What the sign-off was based on, kept with the decision it belongs to.
      return {
        ...state,
        decisions: state.decisions.map((decision) =>
          decision.id === action.id ? { ...decision, audit: action.audit } : decision,
        ),
      }
    case 'reopen-decision':
      // The record survives; the item simply stops being filed.
      return {
        ...state,
        decisions: state.decisions.map((decision) =>
          decision.id === action.id
            ? { ...decision, status: 'reopened', reopenedAt: Date.now(), reopen: action.audit }
            : decision,
        ),
      }
    case 'hand-to-boss':
      // Grant passed it up: same card, now waiting on the boss, with his note attached.
      return {
        ...state,
        decisions: state.decisions.map((decision) =>
          decision.id === action.id
            ? {
                ...decision,
                reviewer: 'boss',
                detail: action.note ? `${decision.detail} — Grant: ${action.note}` : decision.detail,
              }
            : decision,
        ),
      }
    case 'add-event':
      return { ...state, events: [action.event, ...state.events].slice(0, 60) }
    case 'reset-agent':
      return {
        ...state,
        threads: { ...state.threads, [action.agentId]: [greetingFor(action.agent)] },
        tasks: state.tasks.filter((task) => task.agentId !== action.agentId),
        decisions: state.decisions.filter((decision) => decision.agentId !== action.agentId),
      }
    case 'forget-agent': {
      const threads = { ...state.threads }
      delete threads[action.agentId]
      return {
        ...state,
        threads,
        tasks: state.tasks.filter((task) => task.agentId !== action.agentId),
        decisions: state.decisions.filter((decision) => decision.agentId !== action.agentId),
      }
    }
  }
}

export function makeEvent(text: string, tone: OfficeEvent['tone'], agentId?: AgentId): OfficeEvent {
  return { id: makeId('e'), at: Date.now(), text, tone, agentId }
}

export function makeMessage(
  from: ChatMessage['from'],
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return { id: makeId('m'), from, text, at: Date.now(), ...extra }
}
