// The office's roster and rules, shared by the Worker and the browser.
// Change names, roles and specialties here — the prompts, desks and routing
// all read from this file.

export const OFFICE_NAME = 'The Bullpen'
export const OFFICE_TAGLINE = 'Five desks, one boss. Nothing ships without your stamp.'

/** The Freebuff API, unless OPENAI_BASE_URL says otherwise. */
export const FREEBUFF_API_URL = 'https://freebuff.com/api/v1/paid'
export const FREEBUFF_API_KEYS_URL = 'https://freebuff.com/account/api'

/**
 * Models the office may use. Ids are the provider's own (Groq, reached through its
 * OpenAI-compatible API). The Worker refuses any model not in this list, so this is
 * also the spending allowlist.
 */
export const MODELS = [
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B' },
] as const
export type ModelId = (typeof MODELS)[number]['id']
export const DEFAULT_MODEL: ModelId = 'openai/gpt-oss-120b'
export const MODEL_NAME = MODELS.find((model) => model.id === DEFAULT_MODEL)!.name

/** The five built-in desks. Desks added at runtime carry any safe slug. */
export type BuiltinAgentId = 'grant' | 'josh' | 'mark' | 'ichim' | 'rex'

// Widened on purpose: the roster lives in the browser and the boss can hire.
export type AgentId = string

export type Agent = {
  id: AgentId
  name: string
  title: string
  desk: string
  color: string
  tint: string
  handles: string[]
  greeting: string
  idle: string
  /** True for desks the boss added at runtime. */
  custom?: boolean
}

/** What the browser must tell the Worker about a desk it hired itself. */
export type AgentPersona = {
  id: AgentId
  name: string
  title: string
  desk: string
  handles: string[]
}

/** Hard ceiling on the floor, so the 3D room stays readable. */
export const MAX_AGENTS = 8

export const AGENTS: Agent[] = [
  {
    id: 'grant',
    name: 'Grant',
    title: 'Senior developer & IT',
    desk: 'Oversees the floor',
    color: '#2f6e67',
    tint: '#dcedea',
    handles: [
      'Oversees every workload on the floor',
      'Builds and fixes code, tooling and integrations',
      'Reviews the technical work before it reaches you',
    ],
    greeting:
      "Grant here. I keep the floor moving and read every brief before it lands on a desk. Send me a job and I'll put a routing card in front of you — nothing starts until you stamp it.",
    idle: 'Reading the room',
  },
  {
    id: 'josh',
    name: 'Josh',
    title: 'Video editor',
    desk: 'Edit bay',
    color: '#e4674a',
    tint: '#fbe3da',
    handles: [
      'Cuts, pacing and story structure',
      'Captions, thumbnails and export versions',
      'Quality checks on every frame that leaves the bay',
    ],
    greeting:
      "Josh at the edit bay. Send a rough cut, a link or a shot list and I'll come back with a cut plan and timecodes. Publishing waits for your call.",
    idle: 'Timeline is open',
  },
  {
    id: 'mark',
    name: 'Mark',
    title: 'Educator',
    desk: 'Education desk',
    color: '#6e5acf',
    tint: '#e9e4fa',
    handles: [
      'Lesson plans, study guides and revision schedules',
      'Research, summaries and proper citations',
      'Rubrics, feedback and academic feedback loops',
    ],
    greeting:
      'Mark here. Essays, lesson plans, research, revision — tell me the level and the deadline and I’ll build the scaffold. I’ll flag anything that needs your judgment.',
    idle: 'Plans in progress',
  },
  {
    id: 'ichim',
    name: 'Ichim',
    title: 'Financial advisor · your wife',
    desk: 'Money desk',
    color: '#d8557f',
    tint: '#fbe1e8',
    handles: [
      'Budgets, spending reviews and monthly check-ins',
      'Trade-offs, savings goals and household numbers',
      'Every purchase waits for your approval',
    ],
    greeting:
      "I'm Ichim. I keep the numbers honest and the spending boring. I'll draft the budget or the trade-off, and it comes to you before a single coin moves.",
    idle: 'Numbers are tidy',
  },
  {
    id: 'rex',
    name: 'Rex',
    title: 'Scheduler',
    desk: 'Calendar desk',
    color: '#4e8b46',
    tint: '#e2efdc',
    handles: [
      'Calendar, meetings and time-zone wrangling',
      'Deadlines, reminders and protected buffers',
      'Reschedules that don’t turn into chaos',
    ],
    greeting:
      "Rex on scheduling. Give me the week, the meetings and the deadlines; I'll find the gaps and hold the buffers. Nothing goes on the calendar until you confirm it.",
    idle: 'Watching the calendar',
  },
]

export const AGENT_IDS: AgentId[] = AGENTS.map((agent) => agent.id)

/** Ids are lowercase slugs so a hired desk can persist and be addressed safely. */
export function isAgentSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(value)
}

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && AGENT_IDS.includes(value)
}

export function getAgent(id: AgentId): Agent {
  return AGENTS.find((agent) => agent.id === id) ?? AGENTS[0]
}

/** Reply caps and history sent to the model. */
export const MAX_MESSAGE_CHARS = 4_000
export const MAX_CONTEXT_MESSAGES = 16
export const MAX_OUTPUT_TOKENS = 900
/**
 * A sign-off turn gets no conversation history and only this much of the work, so a
 * review costs a fraction of the turn it is judging.
 */
export const MAX_REVIEW_WORK = 1_200
/** How much of Grant's note is kept in the audit trail. */
export const MAX_REVIEW_NOTE = 1_500
/** Best-effort requests per IP per UTC day, to protect the API credits. */
export const DAILY_REQUEST_LIMIT = 150

/** Speech-to-text model on the provider (Groq Whisper). */
export const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo'

/** The languages the floor can hold a spoken conversation in. */
export const VOICE_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'tl', label: 'Tagalog' },
] as const
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]['id']
export const isVoiceLanguage = (value: unknown): value is VoiceLanguage => value === 'en' || value === 'tl'

/** Uploads: how many at once, how big, and how much of a text file the model reads. */
export const MAX_ATTACHMENTS = 4
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024
export const MAX_ATTACHMENT_TEXT = 4_000

/** One spoken turn: the cap stops a stuck microphone from recording forever. */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const MAX_UTTERANCE_MS = 20_000
/** Silence this long ends an utterance in live conversation mode. */
export const VOICE_SILENCE_MS = 900
