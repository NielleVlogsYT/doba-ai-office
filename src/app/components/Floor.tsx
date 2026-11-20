import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import type { Agent, AgentId } from '../../shared/config'
import type { OfficeEvent, Task } from '../../shared/types'
import { clockTime, cx } from '../lib/format'
import { findAgent } from '../lib/roster'
import { Markdown } from './Markdown'

const STATUS_LABEL: Record<Task['status'], string> = {
  working: 'Working',
  review: 'Waiting on you',
  done: 'Filed',
  blocked: 'Stuck',
}

type FloorProps = {
  agents: Agent[]
  tasks: Task[]
  onOpenAgent: (id: AgentId) => void
}

export function Floor({ agents, tasks, onOpenAgent }: FloorProps) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="floor-card">
      <div className="section-head">
        <div>
          <h2>On the floor</h2>
          <p>Every job on a desk right now, and what came back.</p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-floor">
          <p>The floor is quiet.</p>
          <span>Send the first brief and watch someone pick it up.</span>
        </div>
      ) : (
        <div className="task-list">
          {tasks.slice(0, 6).map((task) => {
            const agent = findAgent(agents, task.agentId)
            const expanded = open === task.id && Boolean(task.output)
            return (
              <article key={task.id} className={cx('task', `task-${task.status}`)}>
                <button
                  className="task-avatar"
                  style={{ background: agent.tint, color: agent.color }}
                  onClick={() => onOpenAgent(agent.id)}
                  aria-label={`Open ${agent.name}`}
                >
                  {agent.name[0]}
                </button>
                <div className="task-main">
                  <div className="task-top">
                    <strong>{agent.name}</strong>
                    <span className={`task-status status-${task.status}`}>
                      <span className="status-dot" aria-hidden />
                      {STATUS_LABEL[task.status]}
                    </span>
                    <time>{clockTime(task.createdAt)}</time>
                  </div>
                  <p className="task-brief">{task.brief}</p>

                  {task.status === 'working' && (
                    <div className="progress" aria-label="Work in progress">
                      <span />
                    </div>
                  )}
                  {task.status === 'review' && (
                    <p className="task-hint">The work is on your desk. Open the decision to approve it or send it back.</p>
                  )}
                  {task.status === 'blocked' && <p className="task-hint is-error">{task.output}</p>}

                  {expanded && (
                    <div className="task-output">
                      <Markdown text={task.output} />
                    </div>
                  )}
                </div>
                {task.output && task.status !== 'blocked' && (
                  <button
                    className={cx('task-toggle', expanded && 'is-open')}
                    onClick={() => setOpen(expanded ? null : task.id)}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Hide the work' : 'Read the work'}
                  >
                    <ChevronDown size={18} />
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function Ledger({ events }: { events: OfficeEvent[] }) {
  return (
    <section className="ledger">
      <div className="section-head">
        <div>
          <h2>Work log</h2>
          <p>Every brief, hand-off and stamp leaves a trail.</p>
        </div>
      </div>
      <ol>
        {events.slice(0, 9).map((entry) => (
          <li key={entry.id} className={`tone-${entry.tone}`}>
            <span className="ledger-dot" aria-hidden />
            <time>{clockTime(entry.at)}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
