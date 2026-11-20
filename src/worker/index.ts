import { Hono } from 'hono'

import { DEFAULT_MODEL } from '../shared/config'
import { aiConfigured } from './ai'
import type { AppContext } from './env'
import { agentRoutes } from './routes/agent'
import { voiceRoutes } from './routes/voice'

const app = new Hono<AppContext>()

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/status', (c) => {
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ai: aiConfigured(c.env), model: DEFAULT_MODEL })
})

app.route('/api/agent', agentRoutes)
app.route('/api/voice', voiceRoutes)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Something went wrong in the office.' }, 500)
})

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found.' }, 404) : c.env.ASSETS.fetch(c.req.raw)))

export default {
  async fetch(request: Request, env: AppContext['Bindings'], ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx)
  },
}
