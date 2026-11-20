import { AGENTS, MAX_AGENTS, type Agent, type AgentPersona } from '../../shared/config'

const STORAGE_KEY = 'bullpen.roster.v1'

/** Swatches a hired desk can draw from, so the floor never looks accidental. */
const PALETTE = [
  { color: '#2f6e67', tint: '#dcedea' },
  { color: '#e4674a', tint: '#fbe3da' },
  { color: '#6e5acf', tint: '#e9e4fa' },
  { color: '#d8557f', tint: '#fbe1e8' },
  { color: '#4e8b46', tint: '#e2efdc' },
  { color: '#c2803a', tint: '#f7e8d2' },
  { color: '#3f7fa6', tint: '#dfeef6' },
  { color: '#8a4f9e', tint: '#f0e4f6' },
]

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

/** Desks are already named things like "Copy desk", so don't add a second "desk". */
const seatOf = (desk: string): string => (/desk$/i.test(desk) ? desk : `${desk} desk`)

/**
 * Greetings saved before the seat-name fix can read "on the Copy desk desk".
 * Repair them on load so desks hired earlier read correctly too.
 */
export const tidyGreeting = (text: string): string => {
  let next = text
  while (/\bdesk\s+desk\b/i.test(next)) next = next.replace(/\bdesk\s+desk\b/gi, 'desk')
  return next
}

/** Defaults first, then any desk the boss hired, capped at MAX_AGENTS. */
function merge(saved: unknown): Agent[] {
  const list = Array.isArray(saved) ? (saved as Partial<Agent>[]) : []
  const byId = new Map<string, Partial<Agent>>()
  for (const item of list) {
    if (item && typeof item.id === 'string') byId.set(item.id, item)
  }

  const agents: Agent[] = AGENTS.map((fallback) => {
    const override = byId.get(fallback.id)
    if (!override) return { ...fallback, handles: [...fallback.handles] }
    return {
      ...fallback,
      ...override,
      id: fallback.id,
      custom: false,
      handles: Array.isArray(override.handles) && override.handles.length > 0 ? override.handles : [...fallback.handles],
    }
  })

  const builtinIds = new Set(AGENTS.map((agent) => agent.id))
  for (const item of list) {
    if (!item || typeof item.id !== 'string' || builtinIds.has(item.id)) continue
    if (!agents.some((agent) => agent.id === item.id)) {
      agents.push({
        id: item.id,
        name: typeof item.name === 'string' && item.name ? item.name : 'New hire',
        title: typeof item.title === 'string' && item.title ? item.title : 'Specialist',
        desk: typeof item.desk === 'string' && item.desk ? item.desk : 'The floor',
        color: typeof item.color === 'string' ? item.color : PALETTE[agents.length % PALETTE.length].color,
        tint: typeof item.tint === 'string' ? item.tint : PALETTE[agents.length % PALETTE.length].tint,
        handles: Array.isArray(item.handles) ? item.handles.filter((h): h is string => typeof h === 'string') : [],
        greeting: tidyGreeting(
          typeof item.greeting === 'string' && item.greeting
            ? item.greeting
            : `You're at the ${seatOf(item.desk ?? 'new')}. Tell me what you need and I'll come back with a plan for your stamp.`,
        ),
        idle: typeof item.idle === 'string' && item.idle ? item.idle : 'At the desk',
        custom: true,
      })
    }
  }

  return agents.slice(0, MAX_AGENTS)
}

export function loadRoster(): Agent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return merge(undefined)
    return merge(JSON.parse(raw))
  } catch {
    return merge(undefined)
  }
}

export function saveRoster(agents: Agent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents))
  } catch {
    // Private browsing: the floor still works for this visit.
  }
}

/** Roster-aware lookup. Falls back to the shipped floor so nothing renders blank. */
export function findAgent(agents: Agent[], id: string): Agent {
  return agents.find((agent) => agent.id === id) ?? AGENTS.find((agent) => agent.id === id) ?? agents[0] ?? AGENTS[0]
}

export function personaOf(agent: Agent): AgentPersona {
  return { id: agent.id, name: agent.name, title: agent.title, desk: agent.desk, handles: agent.handles }
}

/** A fresh desk, pre-filled so the form is one edit away from usable. */
export function draftAgent(agents: Agent[]): Agent {
  const swatch = PALETTE[agents.length % PALETTE.length]
  return {
    id: '',
    name: '',
    title: '',
    desk: '',
    color: swatch.color,
    tint: swatch.tint,
    handles: [],
    greeting: '',
    idle: 'At the desk',
    custom: true,
  }
}

export function finalizeAgent(draft: Agent, agents: Agent[]): Agent {
  const name = draft.name.trim() || 'New hire'
  const base = slugify(name) || 'desk'
  let id = base
  let n = 2
  while (agents.some((agent) => agent.id === id)) id = `${base}-${n++}`
  const desk = draft.desk.trim() || 'The floor'
  return {
    ...draft,
    id,
    name,
    title: draft.title.trim() || 'Specialist',
    desk,
    handles: draft.handles.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    greeting:
      draft.greeting.trim() ||
      `${name} here, on the ${seatOf(desk)}. Tell me what needs doing and I'll bring back a plan for your stamp.`,
    idle: draft.idle.trim() || 'At the desk',
    custom: true,
  }
}
