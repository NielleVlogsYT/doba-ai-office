import type { AgentId, AgentPersona } from './config'
import type { OfficeMemory } from './memory'

export type DecisionKind = 'routing' | 'review' | 'spend' | 'schedule' | 'publish'
export type Risk = 'low' | 'medium' | 'high'
export type DecisionStatus = 'pending' | 'approved' | 'declined' | 'reopened'
/** Who has to sign something off: Grant for internal work, the boss for the real calls. */
export type Reviewer = 'boss' | 'grant'

export type Decision = {
  id: string
  kind: DecisionKind
  title: string
  detail: string
  risk: Risk
  /** The agent who raised the decision. */
  agentId: AgentId
  /** Where a routing decision proposes to send the work. */
  targetAgentId?: AgentId
  taskId?: string
  brief?: string
  status: DecisionStatus
  /** Defaults to the boss for decisions raised before desks could self-approve. */
  reviewer: Reviewer
  createdAt: number
  resolvedAt?: number
  /** What the sign-off was based on. Kept so an approval can be inspected or undone. */
  audit?: DecisionAudit
  /** Set when the boss sent a filed item back to its desk. */
  reopenedAt?: number
  /** The boss's reason for reopening, recorded like any other ruling. */
  reopen?: DecisionAudit
}

/** The record of a sign-off: what was submitted, what the reviewer said, and when. */
export type DecisionAudit = {
  /** The work exactly as it was submitted, trimmed for storage. */
  work: string
  /** The reviewer's own words, not just the one-line summary shown in chat. */
  note: string
  /** Who signed it off — Grant, normally. */
  by: AgentId
  at: number
  verdict: Verdict
}

export type TaskStatus = 'working' | 'review' | 'done' | 'blocked'

export type Task = {
  id: string
  agentId: AgentId
  brief: string
  output: string
  status: TaskStatus
  createdAt: number
  demo?: boolean
  decisionId?: string
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file'

/** A file the boss attached to a turn. Media stays in the browser; only text travels. */
export type Attachment = {
  id: string
  name: string
  kind: AttachmentKind
  mime: string
  size: number
  /** Data URL for the in-thread preview. Stripped before the office is saved. */
  src?: string
  /** Text lifted out of a text-like file, so the model can actually read it. */
  text?: string
}

/** What the browser tells the Worker about an attachment: never the bytes. */
export type AttachmentBrief = Pick<Attachment, 'name' | 'kind' | 'mime' | 'size' | 'text'>

export type ChatMessage = {
  id: string
  from: 'you' | 'agent'
  text: string
  at: number
  demo?: boolean
  decisionId?: string
  error?: boolean
  attachments?: Attachment[]
  /** Set when a live conversation turn produced this message. */
  spoken?: boolean
}

export type EventTone = 'work' | 'route' | 'approve' | 'decline' | 'open'

export type OfficeEvent = {
  id: string
  at: number
  text: string
  agentId?: AgentId
  tone: EventTone
}

export type OfficeState = {
  version: 1
  threads: Record<string, ChatMessage[]>
  tasks: Task[]
  decisions: Decision[]
  events: OfficeEvent[]
  openedAt: number
}

export type AgentRequest = {
  agentId: AgentId
  mode: 'chat' | 'task' | 'route' | 'standup' | 'review'
  brief: string
  messages?: { role: 'user' | 'assistant'; content: string }[]
  /** Files the boss attached this turn, described but not uploaded. */
  attachments?: AttachmentBrief[]
  /** Sent for desks the browser added, so the Worker can write their prompt. */
  persona?: AgentPersona
  /** Standing instructions and recent rulings, so a turn is never a blank slate. */
  memory?: OfficeMemory
  /** Condensed older turns from earlier in this thread. */
  digest?: string
}

export type ApiDecision = {
  kind: DecisionKind
  title: string
  detail: string
  risk: Risk
  reviewer: Reviewer
}

/** Grant's call on a desk's submitted work. */
export type Verdict = 'approve' | 'escalate' | 'reject'

export type AgentReply = {
  text: string
  demo: boolean
  decision?: ApiDecision
  routedTo?: AgentId
  reason?: string
  /** Set on a review turn: what Grant decided about the submission. */
  verdict?: Verdict
  /** The reviewer's full note, longer than the one-line `text`. */
  note?: string
}

export type ApiStatus = {
  ai: boolean
  model: string
}
