import { DAILY_REQUEST_LIMIT } from '../shared/config'

/** Best-effort per-IP daily cap. Isolate-local, so treat it as a soft ceiling. */
const usage = new Map<string, { day: string; count: number }>()

export function allowed(ip: string): boolean {
  const day = new Date().toISOString().slice(0, 10)
  const current = usage.get(ip)
  if (!current || current.day !== day) {
    usage.set(ip, { day, count: 1 })
    return true
  }
  if (current.count >= DAILY_REQUEST_LIMIT) return false
  current.count += 1
  return true
}

/** Mutations must be same-origin. Browsers send Origin on cross-site POSTs. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export const clientIp = (request: Request): string =>
  request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'local'
