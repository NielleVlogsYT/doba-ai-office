export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

export const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

export const longDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
