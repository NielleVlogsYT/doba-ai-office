import { Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { MAX_AGENTS, type Agent } from '../../shared/config'
import { presenceFor } from '../lib/presence'
import type { Decision, Task } from '../../shared/types'
import { cx } from '../lib/format'
import { draftAgent, finalizeAgent } from '../lib/roster'

type Props = {
  agents: Agent[]
  tasks: Task[]
  decisions: Decision[]
  onSave: (agent: Agent) => void
  onHire: (agent: Agent) => void
  onReset: (agent: Agent) => void
  onRemove: (agent: Agent) => void
  onClose: () => void
}

const SWATCHES = ['#2f6e67', '#e4674a', '#6e5acf', '#d8557f', '#4e8b46', '#c2803a', '#3f7fa6', '#8a4f9e']

export function FleetPanel({ agents, tasks, decisions, onSave, onHire, onReset, onRemove, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Agent | null>(null)

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id)
    setDraft({ ...agent, handles: [...agent.handles] })
  }

  const startHire = () => {
    setEditingId('__new')
    setDraft(draftAgent(agents))
  }

  const cancel = () => {
    setEditingId(null)
    setDraft(null)
  }

  const commit = () => {
    if (!draft) return
    if (editingId === '__new') onHire(finalizeAgent(draft, agents))
    else onSave({ ...draft, handles: draft.handles.filter((item) => item.trim()) })
    cancel()
  }

  const full = agents.length >= MAX_AGENTS

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="The floor roster">
      <button className="modal-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <p className="kicker">The floor</p>
            <h2>Roster</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="fleet-intro">
          Rename, reassign or reset a desk. Saves apply to the floor at once; a reset clears that desk&apos;s chat, work
          and open decisions.
        </p>

        <ul className="fleet-list">
          {agents.map((agent) => {
            const presence = presenceFor(agent, { tasks, decisions, typing: null })
            const editing = editingId === agent.id
            return (
              <li key={agent.id} className={cx('fleet-row', editing && 'is-editing')}>
                <span className="fleet-avatar" style={{ background: agent.tint, color: agent.color }}>
                  {agent.name.slice(0, 1)}
                </span>
                <div className="fleet-main">
                  <div className="fleet-line">
                    <strong>{agent.name}</strong>
                    <span className="fleet-title">{agent.title}</span>
                    <span className={cx('fleet-presence', `is-${presence.kind}`)}>{presence.label}</span>
                  </div>
                  <p className="fleet-desk">{agent.desk}</p>
                </div>
                <div className="fleet-actions">
                  <button className="btn ghost sm" onClick={() => (editing ? cancel() : startEdit(agent))}>
                    {editing ? 'Cancel' : 'Edit'}
                  </button>
                  <button className="icon-btn" onClick={() => onReset(agent)} title={`Reset ${agent.name}`} aria-label={`Reset ${agent.name}`}>
                    <RotateCcw size={15} />
                  </button>
                  {agent.custom && (
                    <button
                      className="icon-btn danger"
                      onClick={() => onRemove(agent)}
                      title={`Remove ${agent.name}`}
                      aria-label={`Remove ${agent.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {(draft || null) && editingId === '__new' && draft && (
          <AgentForm draft={draft} setDraft={setDraft} onCancel={cancel} onCommit={commit} isNew />
        )}

        {draft && editingId && editingId !== '__new' && (
          <AgentForm draft={draft} setDraft={setDraft} onCancel={cancel} onCommit={commit} />
        )}

        <div className="fleet-foot">
          <button className="btn primary" onClick={startHire} disabled={full || Boolean(editingId)}>
            <Plus size={16} />
            {full ? `Floor is full (${MAX_AGENTS})` : 'Hire a desk'}
          </button>
          <p className="fleet-note">Hired desks get the same routing, approvals and 3D seat as the shipped five.</p>
        </div>
      </div>
    </div>
  )
}

function AgentForm({
  draft,
  setDraft,
  onCancel,
  onCommit,
  isNew = false,
}: {
  draft: Agent
  setDraft: (agent: Agent) => void
  onCancel: () => void
  onCommit: () => void
  isNew?: boolean
}) {
  const set = <K extends keyof Agent>(key: K, value: Agent[K]) => setDraft({ ...draft, [key]: value })
  return (
    <div className="fleet-form">
      <h3>{isNew ? 'Hire a desk' : `Edit ${draft.name || 'this desk'}`}</h3>

      <div className="fleet-grid">
        <label>
          <span className="field-label">Name</span>
          <input value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="Nadia" maxLength={40} />
        </label>
        <label>
          <span className="field-label">Job title</span>
          <input
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder="Copywriter"
            maxLength={60}
          />
        </label>
        <label>
          <span className="field-label">Desk name</span>
          <input
            value={draft.desk}
            onChange={(event) => set('desk', event.target.value)}
            placeholder="Copy desk"
            maxLength={40}
          />
        </label>
        <label>
          <span className="field-label">Idle line</span>
          <input
            value={draft.idle}
            onChange={(event) => set('idle', event.target.value)}
            placeholder="Reading the brief"
            maxLength={40}
          />
        </label>
      </div>

      <label className="fleet-block">
        <span className="field-label">What this desk handles</span>
        <textarea
          rows={3}
          value={draft.handles.join('\n')}
          onChange={(event) => set('handles', event.target.value.split('\n').slice(0, 5))}
          placeholder={'One line per responsibility\nDrafting, editing, tone of voice'}
        />
      </label>

      <label className="fleet-block">
        <span className="field-label">Greeting</span>
        <textarea
          rows={2}
          value={draft.greeting}
          onChange={(event) => set('greeting', event.target.value)}
          placeholder="Leave blank for a default introduction."
          maxLength={400}
        />
      </label>

      <div className="fleet-colors" role="group" aria-label="Desk colour">
        {SWATCHES.map((color) => (
          <button
            key={color}
            className={cx('color-chip', draft.color === color && 'is-active')}
            style={{ background: color }}
            onClick={() => set('color', color)}
            aria-label={`Colour ${color}`}
            aria-pressed={draft.color === color}
          />
        ))}
      </div>

      <div className="modal-actions">
        <button className="btn primary" onClick={onCommit}>
          {isNew ? 'Hire this desk' : 'Save changes'}
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
