import type { VoiceLanguage } from '../../shared/config'
import type { AgentReply, AgentRequest, ApiStatus } from '../../shared/types'

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function askAgent(body: AgentRequest): Promise<AgentReply> {
  let response: Response
  try {
    response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('The office line dropped. Check the connection and try again.')
  }

  const data = await readJson(response)
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'The office could not take that just now.'
    throw new Error(message)
  }
  return data as AgentReply
}

const failureText = (data: unknown, fallback: string) =>
  data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
    ? (data as { error: string }).error
    : fallback

/** Sends one recorded turn to the Worker, which holds the speech-to-text key. */
export async function transcribeAudio(audio: Blob, language?: VoiceLanguage): Promise<string> {
  const form = new FormData()
  form.set('file', audio, `turn.${audio.type.includes('mp4') ? 'm4a' : 'webm'}`)
  if (language) form.set('language', language)

  let response: Response
  try {
    response = await fetch('/api/voice/transcribe', { method: 'POST', body: form, headers: { accept: 'application/json' } })
  } catch {
    throw new Error('The office line dropped. Check the connection and try again.')
  }

  const data = await readJson(response)
  if (!response.ok) throw new Error(failureText(data, 'That recording could not be transcribed.'))
  const text = data && typeof data === 'object' && 'text' in data ? (data as { text: unknown }).text : ''
  if (typeof text !== 'string' || !text.trim()) throw new Error('Nothing was picked up. Try again.')
  return text.trim()
}

export async function getStatus(): Promise<ApiStatus> {
  try {
    const response = await fetch('/api/status', { headers: { accept: 'application/json' } })
    if (!response.ok) return { ai: false, model: 'unknown' }
    return (await response.json()) as ApiStatus
  } catch {
    return { ai: false, model: 'unknown' }
  }
}
