import { Hono } from 'hono'

import { MAX_AUDIO_BYTES, isVoiceLanguage } from '../../shared/config'
import { AiError, aiConfigured, transcribe } from '../ai'
import type { AppContext } from '../env'
import { allowed, clientIp, sameOrigin } from '../limit'

/** Speech to text. The browser records a turn and posts it here; the key stays server-side. */
export const voiceRoutes = new Hono<AppContext>()

voiceRoutes.post('/transcribe', async (c) => {
  c.header('Cache-Control', 'private, no-store')

  if (!sameOrigin(c.req.raw)) return c.json({ error: 'Cross-origin request refused.' }, 403)
  if (!aiConfigured(c.env)) return c.json({ error: 'No API key is configured.' }, 503)
  if (!allowed(clientIp(c.req.raw))) {
    return c.json({ error: 'The office has hit its limit for today. Try again tomorrow.' }, 429)
  }

  // Only a real multipart upload carries audio. Anything else is refused before the
  // body is parsed, which keeps odd requests from reaching the parser at all.
  const type = c.req.header('content-type') ?? ''
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    return c.json({ error: 'Send the recording as form data.' }, 415)
  }

  let body: FormData
  try {
    body = await c.req.formData()
  } catch {
    return c.json({ error: 'Could not read that recording.' }, 400)
  }

  const file = body.get('file')
  if (!(file instanceof File) || file.size === 0) return c.json({ error: 'Send a recording.' }, 400)
  if (file.size > MAX_AUDIO_BYTES) return c.json({ error: 'That recording is too long. Keep a turn under a minute.' }, 413)

  // Whisper understands Tagalog as "tl"; anything else is left to auto-detect.
  const language = body.get('language')
  const hint = isVoiceLanguage(language) ? language : undefined

  try {
    const text = await transcribe(c.env, file, hint)
    return c.json({ text })
  } catch (error) {
    if (error instanceof AiError) {
      const status = error.status === 429 ? 429 : error.status === 400 ? 400 : error.status === 422 ? 422 : 503
      return c.json({ error: error.message }, status)
    }
    console.error('transcribe failed', error)
    return c.json({ error: 'The office line dropped. Try again in a moment.' }, 502)
  }
})
