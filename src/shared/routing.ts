import type { AgentId } from './config'

export type RouteResult = { agentId: AgentId; reason: string }

type Rule = { agentId: AgentId; words: string[]; reason: string }

// Grant's triage rules. Used by the scripted demo and as the fallback when the
// model is unavailable or returns something unparseable.
const RULES: Rule[] = [
  {
    agentId: 'ichim',
    words: ['budget', 'money', 'spend', 'cost', 'invoice', 'price', 'pay ', 'savings', 'expense', 'finance', 'salary', 'refund', 'subscription', 'rent', 'afford'],
    reason: 'Money is involved, so Ichim should see it before anyone commits.',
  },
  {
    agentId: 'rex',
    words: ['schedule', 'calendar', 'meeting', 'reminder', 'appointment', 'deadline', 'reschedule', 'availability', 'time zone', 'invite', 'book a', 'plan my week', 'plan next week'],
    reason: 'This is a timing problem — dates, reminders and buffers — so Rex should hold it.',
  },
  {
    agentId: 'josh',
    words: ['video', 'edit', 'cut', 'reel', 'footage', 'caption', 'thumbnail', 'timeline', 'youtube', 'tiktok', 'reels', 'b-roll', 'podcast clip', 'colour grade', 'color grade'],
    reason: 'This is picture work — cutting, captions or finishing — so it belongs at the edit bay.',
  },
  {
    agentId: 'mark',
    words: ['lesson', 'study', 'exam', 'essay', 'research', 'citation', 'curriculum', 'teach', 'course', 'revise', 'syllabus', 'paper', 'academic', 'grade', 'homework', 'university'],
    reason: 'There is teaching or academic work in this, so it goes to the education desk.',
  },
  {
    agentId: 'grant',
    words: ['code', 'bug', 'deploy', 'api', 'website', 'site', 'server', 'database', 'integrate', 'automate', 'tool', 'script', 'build', 'install', 'tech', 'fix'],
    reason: 'This is technical work, so I will keep it on my desk and review it myself.',
  },
]

export function routeLocally(brief: string): RouteResult {
  const text = ` ${brief.toLowerCase()} `
  let best: { rule: Rule; hits: number } | undefined
  for (const rule of RULES) {
    const hits = rule.words.reduce((count, word) => (text.includes(word) ? count + 1 : count), 0)
    if (hits > 0 && (!best || hits > best.hits)) best = { rule, hits }
  }
  if (best) return { agentId: best.rule.agentId, reason: best.rule.reason }
  return {
    agentId: 'grant',
    reason: 'No obvious specialist in this one, so I will take it myself and pull people in if it grows.',
  }
}
