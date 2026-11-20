import { ArrowUpRight, X } from 'lucide-react'

import { FREEBUFF_API_KEYS_URL } from '../../shared/config'
import type { ApiStatus } from '../../shared/types'

type Props = {
  status: ApiStatus
  onClose: () => void
  onRecheck: () => void
}

export function SetupModal({ status, onClose, onRecheck }: Props) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="How the office runs">
      <button className="modal-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="modal">
        <div className="modal-head">
          <div>
            <p className="kicker">The rules</p>
            <h2>How the office runs</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <ol className="setup-steps">
          <li>
            <strong>You send a brief.</strong> Grant reads it and proposes the desk that should take it.
          </li>
          <li>
            <strong>You approve the routing.</strong> Only then does the work start — or reassign it to someone else.
          </li>
          <li>
            <strong>The work comes back to your desk.</strong> Approve it, or send it back. Nothing is sent, spent,
            published or scheduled without your stamp.
          </li>
        </ol>

        <div className={`setup-status ${status.ai ? 'is-live' : 'is-demo'}`}>
          <span className="mode-dot" aria-hidden />
          <div>
            <strong>{status.ai ? `Live reasoning is on — ${status.model}` : 'Running on scripted demo replies'}</strong>
            <p>
              {status.ai
                ? 'Replies are billed to the API key held on the server. Each reply is capped and requests are rate-limited.'
                : 'The floor still works, but the agents read from a script until a key is added. The roles, routing and approvals are all real.'}
            </p>
          </div>
        </div>

        {!status.ai && (
          <div className="setup-key">
            <h3>Turn on live reasoning</h3>
            <ol>
              <li>Create and fund a Freebuff API key.</li>
              <li>
                Add it as <code>OPENAI_API_KEY</code> in this project’s secrets — Freebuff Cloud: Settings → Secrets;
                Sites: Sites → Secrets; local: <code>.env</code>.
              </li>
              <li>Restart or deploy, then check again.</li>
            </ol>
            <div className="modal-actions">
              <a className="btn primary" href={FREEBUFF_API_KEYS_URL} target="_blank" rel="noreferrer noopener">
                Get an API key
                <ArrowUpRight size={15} />
              </a>
              <button className="btn ghost" onClick={onRecheck}>
                Check again
              </button>
            </div>
            <p className="setup-foot">Keep the key in secrets only — never paste it into chat or into the app.</p>
          </div>
        )}
      </div>
    </div>
  )
}
