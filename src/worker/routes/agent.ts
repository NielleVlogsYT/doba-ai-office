import { Hono } from 'hono'

import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TEXT,
  MAX_CONTEXT_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_REVIEW_NOTE,
  DEFAULT_MODEL,
  getAgent,
  isAgentSlug,
  isVoiceLanguage,
  type AgentPersona,
} from '../../shared/config'
import { MAX_ADDRESS, MAX_RECALL, MAX_RULES, MAX_RULINGS, type OfficeMemory } from '../../shared/memory'
import { routeLocally } from '../../shared/routing'
import type { Env } from '../env'
import type {
  AgentReply,
  ApiDecision,
  AttachmentBrief,
  AttachmentKind,
  DecisionKind,
  Reviewer,
  Risk,
  Verdict,
} from '../../shared/types'
import { AiError, aiConfigured, complete } from '../ai'
import { demoReply } from '../demo'
import type { AppContext } from '../env'
import { allowed, clientIp, sameOrigin } from '../limit'
import { reviewPrompt, routePrompt, standupPrompt, systemPrompt } from '../prompt'
import { looksLikeWork, workTitle } from '../../shared/work'

export const agentRoutes = new Hono<AppContext>()

const KINDS: DecisionKind[] = ['review', 'spend', 'schedule', 'publish']
const RISKS: Risk[] = ['low', 'medium', 'high']
const ATTACHMENT_KINDS: AttachmentKind[] = ['image', 'video', 'audio', 'file']

const clean = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max)

/** Only names and extracted text travel; the bytes stay in the browser. */
function readAttachments(raw: unknown): AttachmentBrief[] {
  if (!Array.isArray(raw)) return []
  const files: AttachmentBrief[] = []
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== 'object') continue
    const value = item as Record<string, unknown>
    if (typeof value.name !== 'string' || !value.name.trim()) continue
    const kind = ATTACHMENT_KINDS.includes(value.kind as AttachmentKind) ? (value.kind as AttachmentKind) : 'file'
    files.push({
      name: clean(value.name, 90),
      kind,
      mime: typeof value.mime === 'string' ? clean(value.mime, 60) : '',
      size: typeof value.size === 'number' && Number.isFinite(value.size) ? Math.max(0, Math.round(value.size)) : 0,
      text: typeof value.text === 'string' ? value.text.slice(0, MAX_ATTACHMENT_TEXT) : undefined,
    })
  }
  return files
}

/**
 * The models on this account cannot see or hear media, so an image or a video is
 * described by name alone. The prompt says so plainly, to stop a desk pretending.
 */
function describeAttachments(files: AttachmentBrief[]): string {
  if (files.length === 0) return ''
  const lines = files.map((file) =>
    file.text
      ? `<file name="${file.name}">\n${file.text}\n</file>`
      : `- ${file.name} (${file.kind}${file.mime ? `, ${file.mime}` : ''}): no readable text`,
  )
  return `The boss attached these files to this turn:\n${lines.join('\n')}\n\nYou cannot see or play images, video or audio; never claim to have viewed or listened to them. Use the text of any file shown above.`
}

/**
 * A hired desk sends its own persona. Keep only what a prompt needs, and keep
 * every field bounded so a client cannot smuggle a wall of instructions in.
 */
function readPersona(raw: unknown): AgentPersona | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  if (!isAgentSlug(value.id)) return undefined
  if (typeof value.name !== 'string' || typeof value.title !== 'string' || typeof value.desk !== 'string') return undefined
  const handles = Array.isArray(value.handles)
    ? value.handles.filter((item): item is string => typeof item === 'string').slice(0, 5).map((item) => clean(item, 90))
    : []
  return {
    id: value.id,
    name: clean(value.name, 40) || 'A desk',
    title: clean(value.title, 60) || 'Specialist',
    desk: clean(value.desk, 40) || 'The floor',
    handles: handles.filter(Boolean),
  }
}

function parseDecision(text: string): { text: string; decision?: ApiDecision } {
  const match = text.match(/<decision(?:\s+target="(boss|grant)")?\s*>([\s\S]*?)<\/decision>/i)
  if (!match) return { text: text.trim() }
  const cleaned = text.replace(match[0], '').trim()
  try {
    const raw = JSON.parse(match[2].trim()) as Partial<ApiDecision>
    if (
      typeof raw.title !== 'string' ||
      typeof raw.detail !== 'string' ||
      typeof raw.kind !== 'string' ||
      !KINDS.includes(raw.kind as DecisionKind)
    ) {
      return { text: cleaned }
    }
    const risk = typeof raw.risk === 'string' && RISKS.includes(raw.risk as Risk) ? (raw.risk as Risk) : 'low'
    const kind = raw.kind as DecisionKind
    // Spending and anything leaving the office stop at the boss whatever the desk asked for.
    const reviewer: Reviewer = kind === 'spend' || kind === 'publish' || match[1] === 'boss' ? 'boss' : 'grant'
    const decision: ApiDecision = {
      kind,
      title: clean(raw.title, 70),
      detail: clean(raw.detail, 240),
      risk,
      reviewer,
    }
    if (!decision.title || !decision.detail) return { text: cleaned }
    return { text: cleaned || 'Ready for your decision.', decision }
  } catch {
    return { text: cleaned }
  }
}

/**
 * Reads one whole reply. The free tier occasionally answers 200 with nothing at all, so
 * an empty reply is asked for once more before it is treated as a failure.
 */
async function readReply(
  env: Env,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const once = async () => {
    let raw = ''
    for await (const chunk of complete(env, { model: DEFAULT_MODEL, messages })) raw += chunk
    return raw
  }
  const first = await once()
  return first.trim() ? first : once()
}

/**
 * What the browser says the floor remembers. Every field is bounded here as well, so a
 * client cannot smuggle a wall of instructions into the system prompt.
 */
function readMemory(value: unknown): OfficeMemory | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<OfficeMemory>
  const rules = typeof raw.rules === 'string' ? raw.rules.slice(0, MAX_RULES) : ''
  const addressAs = typeof raw.addressAs === 'string' ? raw.addressAs.slice(0, MAX_ADDRESS) : ''
  const language = isVoiceLanguage(raw.language) ? raw.language : 'en'
  const rulings = Array.isArray(raw.rulings)
    ? raw.rulings
        .filter((line): line is string => typeof line === 'string' && Boolean(line.trim()))
        .slice(0, MAX_RULINGS)
        .map((line) => clean(line, 160))
    : []
  if (!rules.trim() && !addressAs.trim() && language === 'en' && rulings.length === 0) return undefined
  return { rules, addressAs, language, rulings }
}

/**
 * The backstop for a chat turn: a desk that produced work but forgot its sign-off line
 * still reaches Grant. A plain answer gets no card and stays just a message.
 */
function workForGrant(agentName: string, text: string): ApiDecision | undefined {
  if (!looksLikeWork(text)) return undefined
  return {
    kind: 'review',
    title: `Sign off: ${workTitle(text)}`.slice(0, 70),
    detail: `${agentName} produced this in chat. Waiting for a second pair of eyes before it is filed.`.slice(0, 240),
    risk: 'low',
    reviewer: 'grant',
  }
}

/** Grant's verdict. An unreadable answer escalates rather than quietly approving. */
function parseVerdict(raw: string): { verdict: Verdict; note: string; full: string } {
  const tag = raw.match(/<verdict>\s*(approve|escalate|reject)\s*<\/verdict>/i)
  const noteTag = raw.match(/<note>([\s\S]*?)<\/note>/i)?.[1]
  const inline = noteTag ?? raw.replace(/<verdict>[\s\S]*?<\/verdict>/gi, '')
  const verdict = (tag?.[1].toLowerCase() as Verdict | undefined) ?? 'escalate'
  // The short line goes in chat; the whole answer is what the audit trail keeps.
  return {
    verdict,
    note: clean(inline, 240),
    full: clean(
      raw.replace(/<verdict>[\s\S]*?<\/verdict>/gi, ' ').replace(/<\/?note>/gi, ' '),
      MAX_REVIEW_NOTE,
    ),
  }
}

function parseRoute(raw: string, brief: string): { agentId: string; reason: string } {
  const fallback = routeLocally(brief)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fallback
  try {
    const parsed = JSON.parse(match[0]) as { agentId?: unknown; reason?: unknown }
    if (!isAgentSlug(parsed.agentId)) return fallback
    const reason = typeof parsed.reason === 'string' ? clean(parsed.reason, 160) : ''
    return { agentId: parsed.agentId, reason: reason || fallback.reason }
  } catch {
    return fallback
  }
}

agentRoutes.post('/', async (c) => {
  c.header('Cache-Control', 'private, no-store')

  if (!sameOrigin(c.req.raw)) return c.json({ error: 'Cross-origin request refused.' }, 403)

  if (!allowed(clientIp(c.req.raw))) {
    return c.json({ error: 'The office has hit its limit for today. Try again tomorrow.' }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Could not read that request.' }, 400)
  }

  const input = body as {
    agentId?: unknown
    mode?: unknown
    brief?: unknown
    messages?: unknown
    persona?: unknown
    attachments?: unknown
    memory?: unknown
    digest?: unknown
  }
  if (!isAgentSlug(input.agentId) || typeof input.brief !== 'string' || !input.brief.trim()) {
    return c.json({ error: 'Send a desk and a brief.' }, 400)
  }
  if (input.brief.length > MAX_MESSAGE_CHARS) {
    return c.json({ error: `Keep briefs under ${MAX_MESSAGE_CHARS} characters.` }, 413)
  }
  const mode =
    input.mode === 'task' || input.mode === 'route' || input.mode === 'standup' || input.mode === 'review'
      ? input.mode
      : 'chat'
  const agentId = input.agentId
  const brief = input.brief.trim()
  const files = readAttachments(input.attachments)
  const memory = readMemory(input.memory)
  const digest = typeof input.digest === 'string' ? input.digest.slice(0, MAX_RECALL).trim() : ''

  // Built-in ids use the shipped persona; anything else must bring its own.
  const persona = readPersona(input.persona)
  const agent = persona ?? getAgent(agentId)

  if (mode === 'route') {
    if (!aiConfigured(c.env)) {
      const route = routeLocally(brief)
      return c.json({ text: route.reason, reason: route.reason, routedTo: route.agentId, demo: true } satisfies AgentReply)
    }
    try {
      let raw = ''
      for await (const chunk of complete(c.env, {
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: routePrompt(brief) }],
      })) {
        raw += chunk
      }
      const route = parseRoute(raw, brief)
      return c.json({ text: route.reason, reason: route.reason, routedTo: route.agentId, demo: false } satisfies AgentReply)
    } catch (error) {
      console.error('routing failed', error)
      const route = routeLocally(brief)
      return c.json({ text: route.reason, reason: route.reason, routedTo: route.agentId, demo: true } satisfies AgentReply)
    }
  }

  if (mode === 'review') {
    if (!aiConfigured(c.env)) {
      return c.json({ text: 'Looks sound to me. Filed.', verdict: 'approve', demo: true } satisfies AgentReply)
    }
    try {
      const raw = await readReply(c.env, [{ role: 'system', content: reviewPrompt(brief, memory) }])
      const { verdict, note, full } = parseVerdict(raw)
      return c.json({ text: note || 'Reviewed and filed.', verdict, note: full, demo: false } satisfies AgentReply)
    } catch (error) {
      if (error instanceof AiError) return c.json({ error: error.message }, 503)
      console.error('review failed', error)
      return c.json({ error: 'Grant could not review that just now.' }, 502)
    }
  }

  if (!aiConfigured(c.env)) {
    const reply = demoReply(agent.id, mode === 'task' ? 'task' : 'chat', brief, agent.name)
    return c.json({ text: reply.text, decision: reply.decision, demo: true } satisfies AgentReply)
  }

  const history = Array.isArray(input.messages) ? input.messages : []
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: mode === 'standup' ? standupPrompt(agent, memory) : systemPrompt(agent, mode, memory) },
  ]
  if (mode !== 'standup') {
    // What came before the window, condensed, so an old turn is not simply forgotten.
    if (digest) {
      messages.push({
        role: 'system',
        content: `Earlier in this conversation, condensed oldest first. Remember it, but do not repeat it back unless asked:\n${digest}`,
      })
    }
    for (const item of history.slice(-MAX_CONTEXT_MESSAGES)) {
      if (!item || typeof item !== 'object') continue
      const role = (item as { role?: unknown }).role
      const content = (item as { content?: unknown }).content
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue
      messages.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) })
    }
  }
  const turn =
    mode === 'task'
      ? `Brief from the boss, approved and routed to your desk:\n\n${brief}\n\nDo the work.`
      : mode === 'standup'
        ? `Standup: ${brief}`
        : brief
  const attached = describeAttachments(files)
  messages.push({ role: 'user', content: attached ? `${turn}\n\n${attached}` : turn })

  try {
    const raw = await readReply(c.env, messages)
    if (!raw.trim()) return c.json({ error: `${agent.name} came back empty. Try rewording the brief.` }, 502)
    const parsed = parseDecision(raw)
    return c.json(
      {
        text: parsed.text,
        decision: parsed.decision ?? workForGrant(agent.name, parsed.text),
        demo: false,
      } satisfies AgentReply,
    )
  } catch (error) {
    if (error instanceof AiError) {
      const status = error.status === 429 ? 429 : error.status === 400 ? 400 : 503
      return c.json({ error: error.message }, status)
    }
    console.error('agent turn failed', error)
    return c.json({ error: 'The office line dropped. Try again in a moment.' }, 502)
  }
})
