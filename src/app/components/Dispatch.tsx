import { ArrowUpRight, Stamp } from 'lucide-react'
import { useState } from 'react'

import type { Agent, AgentId } from '../../shared/config'
import { cx } from '../lib/format'

const QUICK = [
  {
    label: 'Tighten a rough cut',
    text: 'Cut the 12-minute founder interview into a 60-second teaser with burned-in captions.',
  },
  {
    label: 'Build a study plan',
    text: 'Build a four-week study plan for a university economics exam, with sources and practice questions.',
  },
  {
    label: 'Check the budget',
    text: 'Review this month’s household budget and find 10% of spending to cut without touching savings.',
  },
  {
    label: 'Plan next week',
    text: 'Plan next week around two fixed meetings on Tuesday and a deadline on Friday afternoon.',
  },
]

type Props = {
  agents: Agent[]
  busy: boolean
  onSend: (brief: string, agent: AgentId | null) => void
}

export function Dispatch({ agents, busy, onSend }: Props) {
  const [brief, setBrief] = useState('')
  const [assign, setAssign] = useState<AgentId | 'auto'>('auto')
  const agent = assign === 'auto' ? null : agents.find((item) => item.id === assign) ?? null
  const canSend = brief.trim().length > 0 && !busy

  const submit = () => {
    if (!canSend) return
    onSend(brief.trim(), assign === 'auto' ? null : assign)
    setBrief('')
  }

  return (
    <section className="dispatch">
      <div className="dispatch-head">
        <div>
          <h2>Give the office a job</h2>
          <p>A brief, a rough cut, a money question — send it down and someone picks it up.</p>
        </div>
        <span className="dispatch-stamp" aria-hidden>
          <Stamp size={20} />
        </span>
      </div>

      <label className="field-label" htmlFor="brief">
        The brief
      </label>
      <textarea
        id="brief"
        rows={3}
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit()
        }}
        placeholder="e.g. Cut the interview into a 60-second teaser, captions burned in. Needs to be live by Friday."
        maxLength={4000}
      />

      <div className="quick-row" aria-label="Example briefs">
        {QUICK.map((item) => (
          <button key={item.label} className="quick-chip" onClick={() => setBrief(item.text)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="assign-block">
        <span className="field-label">Who takes it</span>
        <div className="assign-row" role="group" aria-label="Choose a desk">
          <button
            className={cx('desk-chip', assign === 'auto' && 'is-selected')}
            onClick={() => setAssign('auto')}
            aria-pressed={assign === 'auto'}
          >
            <span className="chip-dot auto-dot" aria-hidden />
            Let Grant route it
          </button>
          {agents.map((item) => (
            <button
              key={item.id}
              className={cx('desk-chip', assign === item.id && 'is-selected')}
              style={{
                color: assign === item.id ? item.color : undefined,
                background: assign === item.id ? item.tint : undefined,
              }}
              onClick={() => setAssign(item.id)}
              aria-pressed={assign === item.id}
            >
              <span className="chip-dot" style={{ background: item.color }} aria-hidden />
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="dispatch-foot">
        <p className="dispatch-note">
          {assign === 'auto'
            ? 'Grant reads it, routes it to the right desk, and the work starts straight away. He signs off what comes back.'
            : `This goes straight to ${agent?.name}'s desk. Sending it is your call.`}
        </p>
        <button className="btn primary send-btn" onClick={submit} disabled={!canSend}>
          {busy ? 'Grant is reading…' : assign === 'auto' ? 'Send to Grant' : `Send to ${agent?.name ?? 'the desk'}`}
          {!busy && <ArrowUpRight size={17} />}
        </button>
      </div>
    </section>
  )
}
