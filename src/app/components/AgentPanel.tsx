import { Megaphone, Mic, Paperclip, Send, Square, Stamp, Volume2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import { MAX_ATTACHMENTS, type Agent, type VoiceLanguage } from '../../shared/config'
import type { Attachment, ChatMessage, Decision, OfficeEvent, Task } from '../../shared/types'
import { transcribeAudio } from '../lib/api'
import { readAttachment, sizeLabel } from '../lib/attachments'
import { clockTime, cx } from '../lib/format'
import { presenceFor } from '../lib/presence'
import { recordUtterance, type Utterance } from '../lib/voice'
import { Markdown } from './Markdown'
import { Panel } from './Panel'

const WORK_STATUS: Record<Task['status'], string> = {
  working: 'Working',
  review: 'Waiting on you',
  done: 'Filed',
  blocked: 'Stuck',
}

/** What the file picker offers: media, plus the text files a model can actually read. */
const ACCEPT = 'image/*,video/*,audio/*,.txt,.md,.csv,.json,.log,.ts,.tsx,.js,.jsx,.css,.html,.yml,.yaml'

type Props = {
  agent: Agent
  /** The one language setting, so a voice note is transcribed in the right language. */
  language: VoiceLanguage
  messages: ChatMessage[]
  tasks: Task[]
  decisions: Decision[]
  events: OfficeEvent[]
  typing: boolean
  ai: boolean
  model: string
  standing: boolean
  onSend: (text: string, attachments: Attachment[]) => void
  onStandup: () => void
  onOpenDecisions: () => void
  onOpenLive: () => void
  onClose: () => void
}

type TimelineItem = { id: string; at: number; kind: 'work' | 'route' | 'approve' | 'decline' | 'open' | 'task'; text: string }

export function AgentPanel({
  agent,
  language,
  messages,
  tasks,
  decisions,
  events,
  typing,
  ai,
  model,
  standing,
  onSend,
  onStandup,
  onOpenDecisions,
  onOpenLive,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'chat' | 'work' | 'log'>('chat')
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [listening, setListening] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const turnRef = useRef<Utterance | null>(null)

  useEffect(() => {
    if (tab !== 'chat') return
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, typing, tab])

  // A drawer that closes mid-recording must not leave the microphone open.
  useEffect(() => () => turnRef.current?.cancel(), [])

  const presence = presenceFor(agent, { tasks, decisions, typing: typing ? agent.id : null })

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...events.map((event) => ({ id: event.id, at: event.at, kind: event.tone, text: event.text })),
      ...tasks.map((task) => ({
        id: `t-${task.id}`,
        at: task.createdAt,
        kind: 'task' as const,
        text: `Brief: ${task.brief} (${WORK_STATUS[task.status]})`,
      })),
      ...decisions.map((decision) => ({
        id: `d-${decision.id}`,
        at: decision.createdAt,
        kind: 'approve' as const,
        text: `${decision.status === 'pending' ? 'Waiting on sign-off' : decision.status === 'reopened' ? 'You reopened it' : decision.reviewer === 'grant' ? (decision.status === 'approved' ? 'Grant approved' : 'Grant rejected') : decision.status === 'approved' ? 'You approved' : 'You declined'}: ${decision.title}`,
      })),
    ]
    return items.sort((a, b) => b.at - a.at).slice(0, 24)
  }, [events, tasks, decisions])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if ((!text && files.length === 0) || typing || reading) return
    setDraft('')
    setFiles([])
    setNotice(null)
    onSend(text || 'I attached some files — take a look.', files)
  }

  const pickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return
    setNotice(null)
    setReading(true)
    try {
      const room = MAX_ATTACHMENTS - files.length
      if (room <= 0) {
        setNotice(`That is the limit: ${MAX_ATTACHMENTS} files per message.`)
        return
      }
      const read = await Promise.all(picked.slice(0, room).map(readAttachment))
      setFiles((prev) => [...prev, ...read])
      if (picked.length > room) setNotice(`Kept the first ${room}. Up to ${MAX_ATTACHMENTS} files per message.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be read.')
    } finally {
      setReading(false)
    }
  }

  const toggleMic = async () => {
    setNotice(null)
    if (turnRef.current) {
      turnRef.current.stop()
      return
    }
    try {
      const turn = await recordUtterance(() => {})
      turnRef.current = turn
      setListening(true)
      const audio = await turn.done
      turnRef.current = null
      setListening(false)
      if (audio.size < 1200) {
        setNotice('Nothing was picked up. Try again, closer to the microphone.')
        return
      }
      setReading(true)
      const text = await transcribeAudio(audio, language)
      setDraft((prev) => (prev ? `${prev} ${text}` : text))
    } catch (error) {
      turnRef.current = null
      setListening(false)
      setNotice(error instanceof Error ? error.message : 'That recording did not go through.')
    } finally {
      setReading(false)
    }
  }

  const dropFile = (id: string) => setFiles((prev) => prev.filter((file) => file.id !== id))

  return (
    <Panel
      label={`${agent.name}, ${agent.title}`}
      onClose={onClose}
      header={
        <div className="agent-head">
          <span className="agent-portrait" style={{ background: agent.tint, color: agent.color }}>
            {agent.name.slice(0, 1)}
          </span>
          <div className="agent-head-text">
            <p className="kicker">{agent.desk}</p>
            <h2>{agent.name}</h2>
            <p className="agent-title">{agent.title}</p>
            <span className={cx('presence-chip', `is-${presence.kind}`)}>
              <span className="mode-dot" aria-hidden />
              {presence.label}
            </span>
          </div>
        </div>
      }
      footer={
        tab === 'chat' ? (
          <div className="chat-foot">
            {files.length > 0 && (
              <ul className="attach-tray" aria-label="Attached files">
                {files.map((file) => (
                  <li key={file.id} className={cx('attach-chip', `is-${file.kind}`)}>
                    <span className="attach-name" title={file.name}>
                      {file.name}
                    </span>
                    <small>{sizeLabel(file.size)}</small>
                    <button type="button" onClick={() => dropFile(file.id)} aria-label={`Remove ${file.name}`}>
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {notice && (
              <p className="composer-alert" role="alert">
                {notice}
              </p>
            )}

            <form className="chat-form" onSubmit={submit}>
              <div className="composer-tools">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach a file"
                  title="Attach a file"
                  disabled={reading}
                >
                  <Paperclip size={17} />
                </button>
                <input
                  ref={fileRef}
                  className="attach-input"
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={(event) => void pickFiles(event)}
                />
                <button
                  type="button"
                  className={cx('icon-btn', listening && 'is-recording')}
                  onClick={() => void toggleMic()}
                  aria-label={listening ? 'Finish recording' : 'Record a voice message'}
                  title={listening ? 'Finish recording' : 'Record a voice message'}
                  disabled={reading && !listening}
                >
                  {listening ? <Square size={15} /> : <Mic size={17} />}
                </button>
              </div>
              <textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit(event)
                  }
                }}
                placeholder={listening ? 'Recording… tap the square to finish' : `Message ${agent.name}…`}
                aria-label={`Message ${agent.name}`}
                maxLength={4000}
              />
              <button
                type="submit"
                className="send-round"
                disabled={(!draft.trim() && files.length === 0) || typing || reading}
                aria-label="Send message"
              >
                <Send size={17} />
              </button>
            </form>

            <div className="composer-row">
              <button className="text-btn live-link" onClick={onOpenLive} disabled={!ai}>
                <Volume2 size={14} />
                Talk live
              </button>
              <p className="composer-note">
                {ai
                  ? `Live via ${model}. Anything that needs a call comes to your desk.`
                  : 'Scripted demo replies. Add an API key for live reasoning.'}
              </p>
            </div>
          </div>
        ) : undefined
      }
    >
      <ul className="handles">
        {agent.handles.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div className="tabs" role="tablist" aria-label="Desk views">
        <button
          role="tab"
          aria-selected={tab === 'chat'}
          className={cx('tab', tab === 'chat' && 'is-active')}
          onClick={() => setTab('chat')}
        >
          Chat
        </button>
        <button
          role="tab"
          aria-selected={tab === 'work'}
          className={cx('tab', tab === 'work' && 'is-active')}
          onClick={() => setTab('work')}
        >
          Work
          {tasks.length > 0 && <span className="tab-count">{tasks.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'log'}
          className={cx('tab', tab === 'log' && 'is-active')}
          onClick={() => setTab('log')}
        >
          Activity
          {timeline.length > 0 && <span className="tab-count">{timeline.length}</span>}
        </button>
      </div>

      {tab === 'chat' && (
        <div className="chat-log" ref={logRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={cx('msg', message.from === 'you' ? 'from-you' : 'from-agent', message.error && 'is-error')}
            >
              {message.from === 'agent' ? <Markdown text={message.text} /> : <p className="msg-text">{message.text}</p>}

              {message.attachments && message.attachments.length > 0 && (
                <div className="msg-files">
                  {message.attachments.map((file) => (
                    <figure key={file.id} className={cx('msg-file', `is-${file.kind}`)}>
                      {file.kind === 'image' && file.src ? (
                        <img src={file.src} alt={file.name} />
                      ) : file.kind === 'video' && file.src ? (
                        <video src={file.src} controls preload="metadata" />
                      ) : file.kind === 'audio' && file.src ? (
                        <audio src={file.src} controls preload="metadata" />
                      ) : null}
                      <figcaption>
                        {file.name}
                        <small>{sizeLabel(file.size)}</small>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {message.decisionId && (
                <button className="msg-flag" onClick={onOpenDecisions}>
                  <Stamp size={13} />
                  On your desk
                </button>
              )}
            </div>
          ))}
          {typing && (
            <div className="msg from-agent typing-row" aria-label={`${agent.name} is typing`}>
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>
      )}

      {tab === 'work' && (
        <div className="work-list">
          {tasks.length === 0 ? (
            <div className="empty-work">
              <p>No work on this desk yet.</p>
              <span>Send a brief through Dispatch and Grant will route it.</span>
            </div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="work-item">
                <div className="work-top">
                  <p className="work-brief">{task.brief}</p>
                  <span className={`task-status status-${task.status}`}>
                    <span className="status-dot" aria-hidden />
                    {WORK_STATUS[task.status]}
                  </span>
                </div>
                {task.output ? (
                  <div className="work-output">
                    <Markdown text={task.output} />
                  </div>
                ) : (
                  <p className="work-pending">Still on it. The work will appear here when the desk is done.</p>
                )}
              </article>
            ))
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="activity">
          <div className="activity-head">
            <div>
              <h3>Standup</h3>
              <p>{presence.detail}</p>
            </div>
            <button className="btn ghost sm" onClick={onStandup} disabled={standing}>
              <Megaphone size={15} />
              {standing ? 'Working…' : 'Ask for a standup'}
            </button>
          </div>

          {timeline.length === 0 ? (
            <div className="empty-work">
              <p>Nothing logged yet.</p>
              <span>Chat, briefs and decisions all land here.</span>
            </div>
          ) : (
            <ol className="activity-list">
              {timeline.map((item) => (
                <li key={item.id} className={cx('activity-item', `tone-${item.kind}`)}>
                  <span className="activity-dot" aria-hidden />
                  <div>
                    <span className="activity-when">{clockTime(item.at)}</span>
                    <p className="activity-text">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Panel>
  )
}
