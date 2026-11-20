import { BrainCircuit, Clock, Megaphone, Stamp, Users } from 'lucide-react'

import { MODEL_NAME, OFFICE_NAME, OFFICE_TAGLINE } from '../../shared/config'
import type { ApiStatus } from '../../shared/types'
import { clockTime, longDate } from '../lib/format'

type Props = {
  status: ApiStatus
  pending: number
  now: number
  standing: boolean
  onOpenDecisions: () => void
  onOpenSetup: () => void
  onOpenRoster: () => void
  onOpenMemory: () => void
  onStandup: () => void
}

export function Header({
  status,
  pending,
  now,
  standing,
  onOpenDecisions,
  onOpenSetup,
  onOpenRoster,
  onOpenMemory,
  onStandup,
}: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Stamp size={21} strokeWidth={2.2} />
        </span>
        <div className="brand-text">
          <h1>{OFFICE_NAME}</h1>
          <p>{OFFICE_TAGLINE}</p>
        </div>
      </div>

      <div className="topbar-mid">
        <span className="clock-chip">
          <Clock size={14} />
          {longDate(now)} · {clockTime(now)}
        </span>
        <button
          className={`mode-chip ${status.ai ? 'is-live' : 'is-demo'}`}
          onClick={onOpenSetup}
          title={status.ai ? `Live reasoning via ${status.model || MODEL_NAME}` : 'Running on scripted demo replies'}
        >
          <span className="mode-dot" aria-hidden />
          {status.ai ? 'Live reasoning' : 'Demo mode'}
        </button>
        <button className="icon-btn labelled" onClick={onOpenRoster} title="Floor roster">
          <Users size={15} />
          Roster
        </button>
        <button className="icon-btn labelled" onClick={onOpenMemory} title="What the office remembers">
          <BrainCircuit size={15} />
          Memory
        </button>
        <button
          className="icon-btn labelled"
          onClick={onStandup}
          disabled={standing}
          title="Ask every idle desk what it would start next"
        >
          <Megaphone size={15} />
          {standing ? 'Standing up…' : 'Standup'}
        </button>
      </div>

      <button className="inbox-btn" onClick={onOpenDecisions}>
        <span className="inbox-text">
          Waiting on you
          <span className="inbox-sub">
            {pending === 0 ? 'desk is clear' : pending === 1 ? '1 decision' : `${pending} decisions`}
          </span>
        </span>
        <span className="inbox-count" aria-hidden>
          {pending}
        </span>
      </button>
    </header>
  )
}
