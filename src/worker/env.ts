export interface Env {
  ASSETS: Fetcher
  // The Freebuff API key. Locally from `.env`; on Sites from Sites → Secrets.
  // It is read here and nowhere else, and never leaves the Worker.
  OPENAI_API_KEY?: string
  // Optional override of the API origin; defaults to the Freebuff API.
  OPENAI_BASE_URL?: string
}

export type AppContext = { Bindings: Env }
