import { X } from 'lucide-react'
import { useState } from 'react'

import { MAX_ADDRESS, MAX_RULES, type OfficeSettings } from '../../shared/memory'

type Props = {
  settings: OfficeSettings
  onSave: (next: OfficeSettings) => void
  onClose: () => void
}

/** What the office keeps in mind: standing instructions, how to address you, and language. */
export function MemoryPanel({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<OfficeSettings>(settings)

  const commit = () => {
    onSave(draft)
    onClose()
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="What the office remembers">
      <button className="modal-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="modal">
        <div className="modal-head">
          <div>
            <p className="kicker">Memory</p>
            <h2>What the office remembers</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <label className="memory-field">
          <span className="field-label">Standing instructions</span>
          <textarea
            rows={5}
            maxLength={MAX_RULES}
            value={draft.rules}
            placeholder="Keep it short. Never spend without asking. Cite sources every time."
            onChange={(event) => setDraft({ ...draft, rules: event.target.value })}
          />
          <span className="memory-hint">Sent with every turn, for every desk. {draft.rules.length}/{MAX_RULES}</span>
        </label>

        <div className="memory-row">
          <label className="memory-field">
            <span className="field-label">Call me</span>
            <input
              maxLength={MAX_ADDRESS}
              value={draft.addressAs}
              placeholder="Boss"
              onChange={(event) => setDraft({ ...draft, addressAs: event.target.value })}
            />
          </label>

          <label className="memory-field">
            <span className="field-label">Desks reply in</span>
            <select
              value={draft.language}
              onChange={(event) => setDraft({ ...draft, language: event.target.value === 'tl' ? 'tl' : 'en' })}
            >
              <option value="en">English</option>
              <option value="tl">Tagalog</option>
            </select>
          </label>
        </div>

        <p className="memory-note">
          Your last six rulings travel with the instructions, so a desk never re-opens a decision you already made.
          All of it is saved on this computer, separately from the office state, so pruning old chat never takes it.
        </p>

        <div className="modal-actions">
          <button className="btn" onClick={commit}>
            Save
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
