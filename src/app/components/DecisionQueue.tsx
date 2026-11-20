import { Check, FileCheck, Stamp, Undo2, X } from 'lucide-react'
import { useState } from 'react'

import type { Agent, AgentId } from '../../shared/config'
import type { Decision, DecisionKind, DecisionStatus, Verdict } from '../../shared/types'
import { clockTime } from '../lib/format'
import { findAgent } from '../lib/roster'

const KIND_LABEL: Record<DecisionKind, string> = {
  routing: 'Routing',
  review: 'Review',
  spend: 'Spending',
  schedule: 'Schedule',
  publish: 'Publish',
}

const KIND_COLOR: Record<DecisionKind, string> = {
  routing: '#f2b837',
  review: '#6e5acf',
  spend: '#d8557f',
  schedule: '#4e8b46',
  publish: '#e4674a',
}

/**
 * Where a ruling belongs on a filed row: an escalation rides on the row itself, because
 * its status can still read "approved"; anything the status already says needs no
 * second mention, and the rest goes in the audit drawer.
 */
const verdictSlot = (status: DecisionStatus, verdict: Verdict): 'row' | 'drawer' | null => {
  if (verdict === 'escalate') return 'row'
  if (status === 'approved' && verdict === 'approve') return null
  if (status === 'declined' && verdict === 'reject') return null
  return 'drawer'
}

/** Only approve and reject reach the drawer; an escalation is already on the row. */
const drawerLabel = (verdict: Verdict) => (verdict === 'approve' ? 'Approved by Grant' : 'Sent back by Grant')

const STATUS_LABEL: Record<DecisionStatus, string> = {
  pending: 'pending',
  approved: 'approved',
  declined: 'declined',
  reopened: 'reopened',
}

type Props = {
  agents: Agent[]
  decisions: Decision[]
  onApprove: (decision: Decision, target?: AgentId, note?: string) => void
  onDecline: (decision: Decision, note?: string) => void
  /** Work Grant signed off. Shown with his note so a sign-off can be inspected. */
  filed?: Decision[]
  onReopen?: (decision: Decision, reason?: string) => void
  showResolved?: boolean
}

function DecisionCard({
  agents,
  decision,
  onApprove,
  onDecline,
}: {
  agents: Agent[]
  decision: Decision
  onApprove: (decision: Decision, target?: AgentId, note?: string) => void
  onDecline: (decision: Decision, note?: string) => void
}) {
  const [target, setTarget] = useState<AgentId>(decision.targetAgentId ?? decision.agentId)
  const [note, setNote] = useState('')
  const requester = findAgent(agents, decision.agentId)
  const chosen = findAgent(agents, target)

  return (
    <article className="decision" style={{ borderTopColor: KIND_COLOR[decision.kind] }}>
      <div className="decision-top">
        <span className="decision-kind">
          <span className="kind-dot" style={{ background: KIND_COLOR[decision.kind] }} aria-hidden />
          {KIND_LABEL[decision.kind]}
        </span>
        <span className={`risk risk-${decision.risk}`}>{decision.risk} risk</span>
        <span className="decision-time">{clockTime(decision.createdAt)}</span>
      </div>

      <h3>{decision.title}</h3>
      <p className="decision-detail">{decision.detail}</p>

      {decision.kind === 'routing' && (
        <div className="routing-row">
          <span className="routing-avatar" style={{ background: chosen.tint, color: chosen.color }}>
            {chosen.name[0]}
          </span>
          <label htmlFor={`route-${decision.id}`}>Desk</label>
          <select
            id={`route-${decision.id}`}
            value={target}
            onChange={(event) => setTarget(event.target.value as AgentId)}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} — {agent.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="decision-source">
        Raised by {requester.name}
        {decision.kind === 'routing' && decision.targetAgentId
          ? ` · suggested ${findAgent(agents, decision.targetAgentId).name}`
          : ''}
      </p>

      <input
        className="decision-note"
        value={note}
        placeholder="Why? A note for the record"
        aria-label="Note for the record"
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="decision-actions">
        <button
          className="btn approve"
          onClick={() => onApprove(decision, decision.kind === 'routing' ? target : undefined, note)}
        >
          <Check size={16} />
          {decision.kind === 'routing' ? 'Approve & assign' : 'Approve'}
        </button>
        <button className="btn ghost" onClick={() => onDecline(decision, note)}>
          <X size={15} />
          Decline
        </button>
      </div>
    </article>
  )
}

function FiledRow({
  agents,
  decision,
  onReopen,
  onAsk,
  onReason,
  confirming,
  reason,
}: {
  agents: Agent[]
  decision: Decision
  onReopen: (decision: Decision, reason?: string) => void
  /** Ask for confirmation, or pass null to dismiss it. */
  onAsk: (id: string | null) => void
  onReason: (reason: string) => void
  confirming: boolean
  reason: string
}) {
  const desk = findAgent(agents, decision.agentId)
  const filedAt = decision.audit?.at ?? decision.resolvedAt
  const slot = decision.audit ? verdictSlot(decision.status, decision.audit.verdict) : null

  return (
    <div className={`filed-row is-${decision.status}`}>
      <div className="filed-head">
        <span className="filed-icon" aria-hidden>
          <FileCheck size={13} />
        </span>
        <span className="resolved-title">{decision.title}</span>
        <span className="resolved-status">{STATUS_LABEL[decision.status]}</span>
        {filedAt ? <span className="decision-time">{clockTime(filedAt)}</span> : null}
      </div>

      <div className="filed-meta">
        {desk.name}
        {decision.audit ? ` · signed off by ${findAgent(agents, decision.audit.by).name}` : ''}
        {slot === 'row' ? <span className="filed-escalated"> · escalated</span> : null}
      </div>

      {decision.reopen?.note ? <p className="filed-note">You: {decision.reopen.note}</p> : null}

      {decision.audit && (
        <details className="audit">
          <summary>What he saw and what he said</summary>
          {slot === 'drawer' && <p className="audit-verdict">{drawerLabel(decision.audit.verdict)}</p>}
          <p className="audit-note">{decision.audit.note}</p>
          <pre className="audit-work">{decision.audit.work}</pre>
        </details>
      )}

      {decision.status !== 'reopened' &&
        (confirming ? (
          // A reopen is not free: the desk works again and Grant reviews again.
          <div className="filed-confirm">
            <span>Back to {desk.name}? One desk run, then a Grant review.</span>
            <div className="filed-ask">
              <input
                className="filed-reason"
                value={reason}
                placeholder="Why? Optional"
                aria-label="Why reopen it"
                onChange={(event) => onReason(event.target.value)}
              />
              <button className="btn approve small" onClick={() => onReopen(decision, reason)}>
                Reopen it
              </button>
              <button className="btn ghost small" onClick={() => onAsk(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn ghost small" onClick={() => onAsk(decision.id)}>
            <Undo2 size={13} />
            Reopen — back to {desk.name}
          </button>
        ))}
    </div>
  )
}

export function DecisionQueue({
  agents,
  decisions,
  onApprove,
  onDecline,
  filed = [],
  onReopen,
  showResolved = false,
}: Props) {
  const [asking, setAsking] = useState<{ id: string; reason: string } | null>(null)
  const pending = decisions.filter((decision) => decision.status === 'pending')
  const resolved = decisions.filter((decision) => decision.status !== 'pending').slice(0, 6)

  return (
    <div className="decision-list">
      {pending.length === 0 ? (
        <div className="empty-decisions">
          <span className="empty-stamp" aria-hidden>
            <Stamp size={22} />
          </span>
          <p>Your desk is clear.</p>
          <span>Only your calls land here — money, publishing, dates that bind people. Grant files the rest.</span>
        </div>
      ) : (
        pending.map((decision) => (
          <DecisionCard
            key={decision.id}
            agents={agents}
            decision={decision}
            onApprove={onApprove}
            onDecline={onDecline}
          />
        ))
      )}

      {showResolved && resolved.length > 0 && (
        <div className="resolved-list">
          <h3>Recent calls</h3>
          {resolved.map((decision) => (
            <div key={decision.id} className={`resolved-row is-${decision.status}`}>
              <span className="resolved-icon" aria-hidden>
                {decision.status === 'approved' ? <Check size={13} /> : <X size={13} />}
              </span>
              <div className="resolved-body">
                <div className="resolved-line">
                  <span className="resolved-title">{decision.title}</span>
                  <span className="resolved-status">{STATUS_LABEL[decision.status]}</span>
                </div>
                {decision.audit?.note ? <p className="resolved-note">{decision.audit.note}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showResolved && filed.length > 0 && (
        <div className="resolved-list filed-list">
          <h3>Grant's rulings</h3>
          {filed.slice(0, 8).map((decision) => (
            <FiledRow
              key={decision.id}
              agents={agents}
              decision={decision}
              confirming={asking?.id === decision.id}
              reason={asking?.id === decision.id ? asking.reason : ''}
              onAsk={(id) => setAsking(id ? { id, reason: '' } : null)}
              onReason={(text) => setAsking((current) => (current ? { ...current, reason: text } : current))}
              onReopen={(chosen, why) => {
                setAsking(null)
                onReopen?.(chosen, why)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
