import type { VoiceLanguage } from './config'
import type { ChatMessage, Decision } from './types'

/**
 * What the boss wants kept, in their own words. Stored apart from the office state, so a
 * crowded browser pruning old chat can never take the standing instructions with it.
 */
export type OfficeSettings = {
  /** Standing instructions, in force on every turn, for every desk. */
  rules: string
  /** What the desks should call the boss. */
  addressAs: string
  /** The one language setting: prompts, transcription and speech all read it. */
  language: VoiceLanguage
}

/** Settings plus the floor's recent decisions: what a desk is handed on every turn. */
export type OfficeMemory = OfficeSettings & {
  /** The last few rulings, one line each, newest first. */
  rulings: string[]
}

export const DEFAULT_SETTINGS: OfficeSettings = { rules: '', addressAs: '', language: 'en' }

export const MAX_RULES = 1_200
export const MAX_ADDRESS = 40
export const MAX_RULINGS = 6

/** How many turns of a thread travel word for word. */
export const RECALL_KEEP = 10
/** A digest of everything older, in characters — a couple of hundred tokens at most. */
export const MAX_RECALL = 900
const RECALL_LINE = 120

/**
 * Older turns, condensed. The recent ones are sent whole; this keeps the shape of the
 * rest of the thread in front of the desk without paying for the whole history again.
 */
export function recallDigest(messages: ChatMessage[], keep = RECALL_KEEP): string {
  const older = messages.slice(0, Math.max(0, messages.length - keep)).filter((message) => !message.error && message.text.trim())
  if (older.length === 0) return ''

  const lines: string[] = []
  let budget = MAX_RECALL
  // Newest first while there is room, then flipped so the oldest surviving line reads first.
  for (let index = older.length - 1; index >= 0 && budget > 0; index -= 1) {
    const message = older[index]
    const text = message.text.replace(/\s+/g, ' ').trim()
    const label = message.from === 'you' ? 'Boss' : 'You'
    const line = `${label}: ${text.length > RECALL_LINE ? `${text.slice(0, RECALL_LINE).trimEnd()}…` : text}`
    if (line.length > budget) break
    lines.unshift(line)
    budget -= line.length + 1
  }
  return lines.join('\n')
}

/** One line per filed call, so a desk can see what has already been decided. */
export function recentRulings(decisions: Decision[], limit = MAX_RULINGS): string[] {
  return decisions
    .filter((decision) => decision.status !== 'pending')
    .slice(0, limit)
    .map((decision) => {
      const at = decision.audit?.at ?? decision.resolvedAt ?? decision.reopenedAt ?? decision.createdAt
      const day = new Date(at).toISOString().slice(0, 10)
      const verdict = decision.audit?.verdict ?? (decision.status === 'approved' ? 'approve' : 'reject')
      return `${day} · ${decision.agentId} · ${verdict} — ${decision.title}`
    })
}
