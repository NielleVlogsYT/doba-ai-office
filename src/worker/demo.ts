// Scripted replies for demo mode (no API key configured) and for graceful
// fallbacks. They are deliberately specific to each desk so the office still
// feels staffed before a key is added. Live reasoning replaces all of this.

import type { AgentId, BuiltinAgentId } from '../shared/config'
import type { ApiDecision } from '../shared/types'

export type DemoReply = { text: string; decision?: ApiDecision }

const snippet = (text: string, max = 110) => {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

const chat: Record<BuiltinAgentId, (brief: string) => string> = {
  grant: (brief) =>
    `I've read it: “${snippet(brief)}”. It doesn't need a specialist yet — put it through Dispatch and I'll send back a routing card with my recommendation. You approve, then the desk picks it up. Nothing moves before that.`,
  josh: (brief) =>
    `“${snippet(brief)}” — that's an edit job I can take. If it's a rough cut, I'd start with a 60-second pass: strongest soundbite first, cut to the beat, captions burned in at 42 characters a line. Send it through Dispatch with the footage and I'll come back with a cut plan for you to stamp.`,
  mark: (brief) =>
    `“${snippet(brief)}” — happy to take that. Tell me the level (school, college, undergrad?) and the deadline, and I'll build the outline, the sources and a revision plan. Nothing gets submitted until you've read it.`,
  ichim: (brief) =>
    `“${snippet(brief)}” — I'll put numbers around it before anyone spends anything. Send the brief through Dispatch and I'll bring back the budget, the trade-offs and the one line that actually matters. You sign off; I keep the receipts.`,
  rex: (brief) =>
    `“${snippet(brief)}” — give me the dates that are fixed and the ones that are flexible. I'll find the gaps, hold buffers either side, and send you a week you can confirm. Nothing gets locked in until you say so.`,
}

const tasks: Record<BuiltinAgentId, (brief: string) => DemoReply> = {
  grant: (brief) => ({
    text: `Here is the technical pass on “${snippet(brief)}”.

**Plan**
1. Confirm the constraints: platform, budget, and who maintains this after launch.
2. Build the smallest version that proves the idea — no extra accounts, no new services.
3. Add one safeguard: same-origin checks, request limits and a rollback path.
4. Put it behind a preview URL and test the three flows that matter.

**Risks**
- Anything with a database needs an owner and a backup plan.
- Domains and keys are a handover conversation, not a one-line change.

I can start on your word. I won't deploy or spend anything before then.`,
    decision: {
      kind: 'publish',
      title: 'Ship the technical plan to a preview?',
      detail: 'Grant has a build plan ready and wants a go-ahead before touching the live setup.',
      risk: 'medium',
      reviewer: 'boss',
    },
  }),
  josh: (brief) => ({
    text: `Cut plan for “${snippet(brief)}”.

- **0:00–0:04** — cold open on the strongest line, no title card.
- **0:04–0:22** — story spine: who, what changed, why it matters.
- **0:22–0:48** — proof: b-roll under the claim, no talking head longer than 6 seconds.
- **0:48–0:58** — the turn: the one line people will repeat.
- **0:58–1:00** — end card, no music swell.

**Deliverables:** 16:9 master, 9:16 reframe, burned-in captions at 42 characters a line, captions file, two thumbnail options.

Flagged: the music bed needs a licence check before this goes anywhere.`,
    decision: {
      kind: 'publish',
      title: 'Approve the 60-second cut plan?',
      detail: 'Josh needs a yes on the structure and the licensed music before the first export.',
      risk: 'low',
      reviewer: 'boss',
    },
  }),
  mark: (brief) => ({
    text: `Study plan: “${snippet(brief)}”.

1. **Diagnose** — ten questions to find the actual gap, not the whole syllabus.
2. **Build the spine** — one page of notes per topic, in your own words.
3. **Retrieve** — twenty minutes of recall, then check against the source.
4. **Apply** — one past-paper question under timed conditions.
5. **Review** — keep what worked, drop what didn't, repeat on Thursday.

Sources: two primary, one secondary, all cited in full. I've kept the reading list deliberately short so it gets done.`,
    decision: {
      kind: 'review',
      title: 'Approve the study plan?',
      detail: 'Mark wants your OK on the scope, level and two source texts before writing the full pack.',
      risk: 'low',
      reviewer: 'grant',
    },
  }),
  ichim: (brief) => ({
    text: `Budget check: “${snippet(brief)}”.

- **Fixed costs first** — rent, utilities, subscriptions. Cancel anything unused this month.
- **Set the ceiling before the spend**, not after. I'd cap this at 10% of the month's surplus.
- **Keep a buffer** of one month's essentials untouched.
- **One-offs come from surplus.** Recurring costs need their own line.

I need two numbers to finish this: take-home for the month, and what is already committed. Then I'll bring back the exact figure.`,
    decision: {
      kind: 'spend',
      title: 'Approve the spending ceiling?',
      detail: 'Ichim has a cap in mind and needs your sign-off before any money moves.',
      risk: 'medium',
      reviewer: 'boss',
    },
  }),
  rex: (brief) => ({
    text: `Week plan: “${snippet(brief)}”.

- **Mon 09:00–10:30** — deep work, no meetings.
- **Tue 11:00** — the one meeting that actually needs you, 25-minute cap.
- **Wed** — buffer, deliberately empty. It will be used.
- **Thu 14:00–15:30** — review and replies, batched.
- **Fri 16:00** — look at the week, move what slipped.

I've held thirty minutes either side of anything external. Nothing is on the calendar until you confirm the fixed points.`,
    decision: {
      kind: 'schedule',
      title: 'Confirm the week?',
      detail: 'Rex has a draft calendar with buffers held and wants your approval before sending invites.',
      risk: 'low',
      reviewer: 'grant',
    },
  }),
}

export function demoReply(agentId: AgentId, mode: 'chat' | 'task', brief: string, name = 'This desk'): DemoReply {
  const scripted = chat[agentId as BuiltinAgentId]
  if (!scripted) {
    // A desk the boss hired. Keep the demo honest: offer a plan, never the work.
    if (mode === 'chat') {
      return {
        text: `${name} here. "${snippet(brief)}" is on my desk, but no API key is configured yet, so I am reading from a script. Add one and I will do the real work — until then, put the brief through Dispatch and I will send back a plan you can stamp.`,
      }
    }
    return {
      text: `Plan for "${snippet(brief)}".\n\n1. Confirm what done looks like, and who reads it.\n2. Do the smallest version that can be checked today.\n3. Bring back the draft with the open questions marked.\n\nThis is a scripted demo reply from a desk added at runtime. Nothing here is model output.`,
      decision: {
        kind: 'review',
        title: `Approve ${name}'s plan?`,
        detail: `${name} drafted an approach and needs your sign-off before doing the work.`,
        risk: 'low',
        reviewer: 'grant',
      },
    }
  }
  if (mode === 'chat') return { text: scripted(brief) }
  return tasks[agentId as BuiltinAgentId](brief)
}
