import { Stamp } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'

import {
  MAX_MESSAGE_CHARS,
  MAX_REVIEW_NOTE,
  MAX_REVIEW_WORK,
  MODEL_NAME,
  OFFICE_NAME,
  type Agent,
  type AgentId,
} from '../shared/config'
import { RECALL_KEEP, recallDigest, recentRulings } from '../shared/memory'
import { routeLocally } from '../shared/routing'
import type { ApiDecision, ApiStatus, Attachment, Decision, DecisionAudit, Task, Verdict } from '../shared/types'
import { AgentPanel } from './components/AgentPanel'
import { DecisionQueue } from './components/DecisionQueue'
import { Dispatch } from './components/Dispatch'
import { FleetPanel } from './components/FleetPanel'
import { Floor, Ledger } from './components/Floor'
import { Header } from './components/Header'
import { LiveVoice } from './components/LiveVoice'
import { MemoryPanel } from './components/MemoryPanel'
import { Office3D } from './components/office/Office3D'
import { Panel } from './components/Panel'
import { SetupModal } from './components/SetupModal'
import { askAgent, getStatus } from './lib/api'
import { briefOf } from './lib/attachments'
import { sleep } from './lib/format'
import { idleDesks } from './lib/presence'
import { findAgent, loadRoster, personaOf, saveRoster } from './lib/roster'
import { loadSettings, saveSettings } from './lib/settings'
import { loadState, makeEvent, makeId, makeMessage, reducer, saveState } from './lib/store'

type View = { kind: 'agent'; agentId: AgentId } | { kind: 'decisions' } | null
type Toast = { id: number; message: string; detail?: string }

/** How many idle desks one standup asks, to keep a click from spending a lot. */
const STANDUP_LIMIT = 3

export function App() {
  const [agents, setAgents] = useState<Agent[]>(() => loadRoster())
  const [state, dispatch] = useReducer(reducer, agents, loadState)
  const [status, setStatus] = useState<ApiStatus>({ ai: false, model: MODEL_NAME })
  const [view, setView] = useState<View>(null)
  const [live, setLive] = useState<Agent | null>(null)
  const [setup, setSetup] = useState(false)
  const [fleet, setFleet] = useState(false)
  const [typing, setTyping] = useState<AgentId | null>(null)
  const [routing, setRouting] = useState(false)
  const [standing, setStanding] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [settings, setSettings] = useState(() => loadSettings())
  const [memoryPanel, setMemoryPanel] = useState(false)

  /** What every desk is handed: standing instructions, how to address you, recent rulings. */
  const memory = useMemo(() => ({ ...settings, rulings: recentRulings(state.decisions) }), [settings, state.decisions])

  useEffect(() => {
    saveRoster(agents)
  }, [agents])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const storageWarned = useRef(false)
  useEffect(() => {
    const outcome = saveState(state)
    if (outcome.pruned > 0) {
      // Adopt what was written, so the screen never shows records storage no longer has.
      dispatch({ type: 'replace-state', state: outcome.state })
      dispatch({
        type: 'add-event',
        event: makeEvent(
          `Storage was nearly full — pruned ${outcome.pruned} old records to keep the audit trail.`,
          'work',
        ),
      })
      notify('Storage was getting full', `${outcome.pruned} old records pruned. The audit trail is intact.`)
    } else if (outcome.failed && !storageWarned.current) {
      storageWarned.current = true
      notify('Could not save to this browser', 'Storage is full even after pruning. Export or clear the office.')
    }
  }, [state])

  useEffect(() => {
    let live = true
    void getStatus().then((next) => {
      if (live) setStatus(next)
    })
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = (message: string, detail?: string) => setToast({ id: Date.now(), message, detail })
  const agentOf = (id: AgentId) => findAgent(agents, id)

  /**
   * Files whatever a desk decided. Internal work goes to Grant for sign-off; anything
   * that is the boss's call — or that Grant escalates — lands on the boss's desk.
   */
  const handleDecision = (agent: Agent, api: ApiDecision, work: string, taskId?: string): string => {
    const id = makeId('d')
    const decision: Decision = { id, ...api, agentId: agent.id, taskId, status: 'pending', createdAt: Date.now() }
    dispatch({ type: 'add-decision', decision })

    if (decision.reviewer === 'grant') {
      dispatch({ type: 'add-event', event: makeEvent(`${agent.name} sent work to Grant for sign-off.`, 'work', agent.id) })
      void runGrantReview(decision, work)
    } else {
      dispatch({ type: 'add-event', event: makeEvent(`${agent.name} needs your call: ${decision.title}`, 'work', agent.id) })
      notify(`${agent.name} needs a decision`, decision.title)
    }
    return id
  }

  /** Grant signs off internal work, sends it back, or passes it up to the boss. */
  const runGrantReview = async (decision: Decision, work: string) => {
    const desk = agentOf(decision.agentId)
    const gate = agentOf('grant')
    try {
      const reply = await askAgent({
        agentId: 'grant',
        mode: 'review',
        brief: `${desk.name} (${desk.title}) submitted internal work.\n\nSign-off asked: ${decision.title}\nSummary: ${decision.detail}\n\nThe work:\n${work.slice(0, MAX_REVIEW_WORK)}`,
        persona: personaOf(gate),
        memory,
      })

      // The trail: what was submitted, Grant's own words, and when he ruled.
      const auditFor = (verdict: Verdict): DecisionAudit => ({
        work: work.slice(0, MAX_REVIEW_NOTE),
        note: reply.note?.trim() || reply.text,
        by: 'grant',
        at: Date.now(),
        verdict,
      })

      if (reply.verdict === 'reject') {
        dispatch({ type: 'resolve-decision', id: decision.id, status: 'declined' })
        dispatch({ type: 'audit-decision', id: decision.id, audit: auditFor('reject') })
        if (decision.taskId) dispatch({ type: 'patch-task', id: decision.taskId, patch: { status: 'blocked' } })
        dispatch({
          type: 'add-event',
          event: makeEvent(`Grant sent back ${desk.name}'s work: ${reply.text}`, 'decline', desk.id),
        })
        notify(`Grant bounced ${desk.name}'s work`, reply.text)
        return
      }

      if (reply.verdict === 'escalate') {
        dispatch({ type: 'hand-to-boss', id: decision.id, note: reply.text })
        dispatch({ type: 'audit-decision', id: decision.id, audit: auditFor('escalate') })
        dispatch({
          type: 'add-event',
          event: makeEvent(`Grant passed ${desk.name}'s work to you: ${reply.text}`, 'approve', desk.id),
        })
        notify('Grant wants your call', reply.text || decision.title)
        return
      }

      dispatch({ type: 'resolve-decision', id: decision.id, status: 'approved' })
      dispatch({ type: 'audit-decision', id: decision.id, audit: auditFor('approve') })
      if (decision.taskId) dispatch({ type: 'patch-task', id: decision.taskId, patch: { status: 'done' } })
      dispatch({
        type: 'add-event',
        event: makeEvent(`Grant signed off ${desk.name}'s work — no call needed from you.`, 'approve', desk.id),
      })
      notify(`${desk.name}'s work is filed`, 'Grant signed off. Nothing needs you.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Grant could not review that.'
      dispatch({ type: 'hand-to-boss', id: decision.id, note: 'Grant could not review this.' })
      dispatch({
        type: 'add-event',
        event: makeEvent(`Grant could not review ${desk.name}'s work: ${message}`, 'work', desk.id),
      })
      notify('Grant is unavailable', 'The call is on your desk instead.')
    }
  }

  const runTask = async (task: Task) => {
    const agent = agentOf(task.agentId)
    try {
      const [reply] = await Promise.all([
        askAgent({ agentId: task.agentId, mode: 'task', brief: task.brief, persona: personaOf(agent), memory }),
        sleep(900),
      ])
      // Routed work always reaches Grant. If the desk forgot its sign-off line, the
      // review card is raised here instead of letting the work file itself.
      const api: ApiDecision = reply.decision ?? {
        kind: 'review',
        title: `Sign off ${agent.name}'s work?`.slice(0, 70),
        detail: `Finished work on: ${task.brief.slice(0, 90)}`,
        risk: 'low',
        reviewer: 'grant',
      }
      const decisionId = handleDecision(agent, api, reply.text, task.id)
      dispatch({
        type: 'patch-task',
        id: task.id,
        patch: { output: reply.text, status: 'review', demo: reply.demo, decisionId },
      })
      if (!reply.decision) {
        dispatch({
          type: 'add-event',
          event: makeEvent(`${agent.name} finished and filed it to Grant: ${task.brief.slice(0, 60)}`, 'work', task.agentId),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      dispatch({ type: 'patch-task', id: task.id, patch: { output: message, status: 'blocked' } })
      dispatch({ type: 'add-event', event: makeEvent(`${agent.name} got stuck: ${message}`, 'work', task.agentId) })
      notify('That brief hit a snag', message)
    }
  }

  const sendBrief = async (brief: string, preferred: AgentId | null) => {
    const text = brief.trim()
    if (!text) return

    if (preferred) {
      const agent = agentOf(preferred)
      const task: Task = {
        id: makeId('t'),
        agentId: preferred,
        brief: text,
        output: '',
        status: 'working',
        createdAt: Date.now(),
      }
      dispatch({ type: 'add-task', task })
      dispatch({
        type: 'add-event',
        event: makeEvent(`You sent a brief straight to ${agent.name}.`, 'route', preferred),
      })
      notify(`${agent.name} has the brief`, 'The work comes back for your review.')
      void runTask(task)
      return
    }

    setRouting(true)
    let route = routeLocally(text)
    try {
      const reply = await askAgent({ agentId: 'grant', mode: 'route', brief: text })
      if (reply.routedTo) {
        route = { agentId: reply.routedTo, reason: reply.reason?.trim() || routeLocally(text).reason }
      }
    } catch {
      route = routeLocally(text)
    } finally {
      setRouting(false)
    }

    // Grant owns the routing call, so the brief starts on its desk straight away.
    const target = agentOf(route.agentId)
    const task: Task = {
      id: makeId('t'),
      agentId: target.id,
      brief: text,
      output: '',
      status: 'working',
      createdAt: Date.now(),
    }
    dispatch({ type: 'add-task', task })
    dispatch({
      type: 'add-event',
      event: makeEvent(`Grant routed a brief to ${target.name}: ${route.reason}`, 'route', 'grant'),
    })
    notify(`${target.name} picked it up`, route.reason)
    void runTask(task)
  }

  /** Your own ruling, recorded the same way Grant's are: what was on the desk, why, and when. */
  const bossAudit = (decision: Decision, verdict: Verdict, note: string): DecisionAudit => {
    const work = state.tasks.find((task) => task.id === decision.taskId)?.output || decision.brief || decision.detail
    return { work: work.slice(0, MAX_REVIEW_NOTE), note: note.trim(), by: 'boss', at: Date.now(), verdict }
  }

  const approveDecision = (decision: Decision, target?: AgentId, note = '') => {
    dispatch({ type: 'resolve-decision', id: decision.id, status: 'approved' })
    dispatch({ type: 'audit-decision', id: decision.id, audit: bossAudit(decision, 'approve', note) })

    if (decision.kind === 'routing' && decision.brief) {
      const agentId = target ?? decision.targetAgentId ?? 'grant'
      const agent = agentOf(agentId)
      const task: Task = {
        id: makeId('t'),
        agentId,
        brief: decision.brief,
        output: '',
        status: 'working',
        createdAt: Date.now(),
      }
      dispatch({ type: 'add-task', task })
      dispatch({
        type: 'add-event',
        event: makeEvent(`You stamped the routing. ${agent.name} picked up the brief.`, 'approve', agentId),
      })
      notify(`Approved — ${agent.name} has it`, 'The work lands back on your desk.')
      void runTask(task)
      return
    }

    if (decision.taskId) dispatch({ type: 'patch-task', id: decision.taskId, patch: { status: 'done' } })
    dispatch({
      type: 'add-event',
      event: makeEvent(`You approved: ${decision.title}`, 'approve', decision.agentId),
    })
    notify('Approved and filed', decision.title)
  }

  const declineDecision = (decision: Decision, note = '') => {
    dispatch({ type: 'resolve-decision', id: decision.id, status: 'declined' })
    dispatch({ type: 'audit-decision', id: decision.id, audit: bossAudit(decision, 'reject', note) })
    if (decision.taskId) dispatch({ type: 'patch-task', id: decision.taskId, patch: { status: 'blocked' } })
    dispatch({
      type: 'add-event',
      event: makeEvent(`You sent back: ${decision.title}`, 'decline', decision.agentId),
    })
    notify('Sent back to the desk', 'Nothing moves until you send a revised brief.')
  }

  /**
   * Sends filed work back to its desk. The decision keeps its audit trail but stops
   * being filed, and the desk gets the original submission along with Grant's note.
   */
  const reopenDecision = (decision: Decision, reason = '') => {
    const desk = agentOf(decision.agentId)
    const note = decision.audit?.note?.trim()
    const work = decision.audit?.work ?? ''
    const why = reason.trim()
    const brief = [
      `Reopened by the boss: ${decision.title}`,
      'This needs a revision rather than a fresh start.',
      why ? `The boss's reason: ${why}` : '',
      note ? `Grant's note: ${note}` : '',
      work ? `What was filed:\n${work.slice(0, 900)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, MAX_MESSAGE_CHARS)

    // A reopen is a ruling of yours: same record as the rest, kept beside Grant's.
    const audit: DecisionAudit | undefined = why
      ? { work: work.slice(0, MAX_REVIEW_NOTE), note: why, by: 'boss', at: Date.now(), verdict: 'reject' }
      : undefined

    dispatch({ type: 'reopen-decision', id: decision.id, audit })

    const existing = decision.taskId ? state.tasks.find((task) => task.id === decision.taskId) : undefined
    const task: Task = existing
      ? { ...existing, brief, output: '', status: 'working' }
      : { id: makeId('t'), agentId: desk.id, brief, output: '', status: 'working', createdAt: Date.now() }

    // Reuse the original task when there is one, so the desk's panel keeps its history.
    if (existing) dispatch({ type: 'patch-task', id: existing.id, patch: { brief, output: '', status: 'working' } })
    else dispatch({ type: 'add-task', task })

    dispatch({
      type: 'add-event',
      event: makeEvent(`You reopened ${desk.name}'s work — back to the desk for a revision.`, 'work', desk.id),
    })
    notify(`${desk.name} has it back`, 'A revision is under way; Grant will sign it off.')
    void runTask(task)
  }

  const sendChat = async (agentId: AgentId, text: string, attachments: Attachment[] = []): Promise<string | null> => {
    const clean = text.trim()
    if ((!clean && attachments.length === 0) || typing) return null
    const agent = agentOf(agentId)
    const thread = state.threads[agentId] ?? []
    const history = thread
      .slice(-RECALL_KEEP)
      .filter((message) => !message.error)
      .map((message) => ({
        role: message.from === 'you' ? ('user' as const) : ('assistant' as const),
        content: message.text,
      }))
    // Anything older than the window rides along as a few condensed lines.
    const digest = recallDigest(thread)

    dispatch({ type: 'add-message', agentId, message: makeMessage('you', clean, { attachments }) })
    setTyping(agentId)
    try {
      const reply = await askAgent({
        agentId,
        mode: 'chat',
        brief: clean,
        messages: history,
        digest,
        attachments: attachments.map(briefOf),
        persona: personaOf(agent),
        memory,
      })
      const decisionId = reply.decision ? handleDecision(agent, reply.decision, reply.text) : undefined
      // Only a boss-level decision earns the "on your desk" flag in the chat.
      const onBossDesk = reply.decision?.reviewer === 'boss' ? decisionId : undefined
      dispatch({
        type: 'add-message',
        agentId,
        message: makeMessage('agent', reply.text, { demo: reply.demo, decisionId: onBossDesk }),
      })
      return reply.text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The office line dropped.'
      dispatch({ type: 'add-message', agentId, message: makeMessage('agent', message, { error: true }) })
      return null
    } finally {
      setTyping(null)
    }
  }

  /** A desk proposes its own work, with no brief from the boss. */
  const runStandup = async (agent: Agent) => {
    const task: Task = {
      id: makeId('t'),
      agentId: agent.id,
      brief: 'Standup: what this desk would start on its own',
      output: '',
      status: 'working',
      createdAt: Date.now(),
    }
    dispatch({ type: 'add-task', task })
    dispatch({ type: 'add-event', event: makeEvent(`${agent.name} is thinking about next week.`, 'work', agent.id) })
    try {
      const reply = await askAgent({
        agentId: agent.id,
        mode: 'standup',
        brief: 'Propose the one thing you would start on your own, and why now.',
        persona: personaOf(agent),
        memory,
      })
      const decisionId = reply.decision ? handleDecision(agent, reply.decision, reply.text, task.id) : undefined
      dispatch({
        type: 'patch-task',
        id: task.id,
        patch: { output: reply.text, status: reply.decision ? 'review' : 'done', demo: reply.demo, decisionId },
      })
      dispatch({
        type: 'add-event',
        event: makeEvent(
          reply.decision ? `${agent.name} proposed something of their own.` : `${agent.name} filed a standup note.`,
          'work',
          agent.id,
        ),
      })
      notify(`${agent.name} stood up`, reply.decision ? reply.decision.title : 'A note is filed on their desk.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That standup went nowhere.'
      dispatch({ type: 'patch-task', id: task.id, patch: { output: message, status: 'blocked' } })
      notify(`${agent.name} could not stand up`, message)
    }
  }

  const runFloorStandup = async () => {
    const candidates = idleDesks(agents, { tasks: state.tasks, decisions: state.decisions, typing }).slice(0, STANDUP_LIMIT)
    if (candidates.length === 0) {
      notify('Nobody is idle', 'Every desk already has work or a decision open.')
      return
    }
    setStanding(true)
    notify('Standup called', `Asking ${candidates.map((agent) => agent.name).join(', ')}`)
    for (const agent of candidates) await runStandup(agent)
    setStanding(false)
  }

  const saveAgent = (agent: Agent) => {
    setAgents((prev) => prev.map((item) => (item.id === agent.id ? agent : item)))
    dispatch({ type: 'add-event', event: makeEvent(`${agent.name}'s desk was updated.`, 'open', agent.id) })
    notify(`${agent.name} updated`, agent.desk)
  }

  const hireAgent = (agent: Agent) => {
    setAgents((prev) => [...prev, agent])
    dispatch({ type: 'add-message', agentId: agent.id, message: makeMessage('agent', agent.greeting) })
    dispatch({ type: 'add-event', event: makeEvent(`${agent.name} joined the floor.`, 'open', agent.id) })
    notify(`${agent.name} is on the floor`, `${agent.desk} · say hello from the drawer.`)
  }

  const resetAgent = (agent: Agent) => {
    dispatch({ type: 'reset-agent', agentId: agent.id, agent })
    dispatch({ type: 'add-event', event: makeEvent(`${agent.name}'s desk was reset.`, 'open', agent.id) })
    notify(`${agent.name}'s desk is clean`, 'Chat, work and open decisions are cleared.')
  }

  const removeAgent = (agent: Agent) => {
    setAgents((prev) => prev.filter((item) => item.id !== agent.id))
    dispatch({ type: 'forget-agent', agentId: agent.id })
    dispatch({ type: 'add-event', event: makeEvent(`${agent.name} left the floor.`, 'open') })
    setView((current) => (current?.kind === 'agent' && current.agentId === agent.id ? null : current))
    notify(`${agent.name} left the floor`, 'Their desk and work are gone.')
  }

  // The boss's desk only holds what is actually the boss's call; Grant owns the rest.
  const bossDecisions = state.decisions.filter((decision) => decision.reviewer === 'boss')
  // Grant's sign-offs, with the audit trail, and a way to send any of them back.
  const filedWork = state.decisions.filter(
    (decision) => decision.reviewer === 'grant' && decision.status !== 'pending',
  )
  const pending = bossDecisions.filter((decision) => decision.status === 'pending').length
  const activeAgent = view?.kind === 'agent' ? agents.find((agent) => agent.id === view.agentId) ?? null : null

  return (
    <div className="shell">
      <Header
        status={status}
        pending={pending}
        now={now}
        standing={standing}
        onOpenDecisions={() => setView({ kind: 'decisions' })}
        onOpenSetup={() => setSetup(true)}
        onOpenRoster={() => setFleet(true)}
        onOpenMemory={() => setMemoryPanel(true)}
        onStandup={() => void runFloorStandup()}
      />

      <main>
        <Office3D
          agents={agents}
          tasks={state.tasks}
          decisions={state.decisions}
          typing={typing}
          now={now}
          onOpenAgent={(id) => setView({ kind: 'agent', agentId: id })}
          onOpenDecisions={() => setView({ kind: 'decisions' })}
        />

        <div className="workbench">
          <div className="col-main">
            <Dispatch agents={agents} busy={routing} onSend={(brief, agent) => void sendBrief(brief, agent)} />
            <Floor agents={agents} tasks={state.tasks} onOpenAgent={(id) => setView({ kind: 'agent', agentId: id })} />
          </div>

          <aside className="col-side">
            <section className="desk-pane">
              <div className="section-head">
                <div>
                  <h2>Waiting on you</h2>
                  <p>Nothing moves without a stamp.</p>
                </div>
                <button className="text-btn" onClick={() => setView({ kind: 'decisions' })}>
                  Open desk
                </button>
              </div>
              <DecisionQueue
                agents={agents}
                decisions={bossDecisions}
                onApprove={approveDecision}
                onDecline={declineDecision}
              />
            </section>

            <Ledger events={state.events} />
          </aside>
        </div>
      </main>

      <footer className="foot">
        <span>{OFFICE_NAME} · every call stops at your chair</span>
        <span className="foot-links">
          <button className="text-btn" onClick={() => setFleet(true)}>
            Roster
          </button>
          <button className="text-btn" onClick={() => setSetup(true)}>
            How the office runs
          </button>
        </span>
      </footer>

      {/* The live panel layers over the desk panel, so only one is on screen. */}
      {view?.kind === 'agent' && activeAgent && !live && (
        <AgentPanel
          agent={activeAgent}
          language={settings.language}
          messages={state.threads[activeAgent.id] ?? []}
          tasks={state.tasks.filter((task) => task.agentId === activeAgent.id)}
          decisions={state.decisions.filter((decision) => decision.agentId === activeAgent.id)}
          events={state.events.filter((event) => event.agentId === activeAgent.id)}
          typing={typing === activeAgent.id}
          ai={status.ai}
          model={status.model || MODEL_NAME}
          standing={standing}
          onSend={(text, attachments) => void sendChat(activeAgent.id, text, attachments)}
          onStandup={() => void runStandup(activeAgent)}
          onOpenDecisions={() => setView({ kind: 'decisions' })}
          onOpenLive={() => setLive(activeAgent)}
          onClose={() => setView(null)}
        />
      )}

      {live && agents.some((agent) => agent.id === live.id) && (
        <LiveVoice
          agent={live}
          ai={status.ai}
          language={settings.language}
          onLanguage={(language) => setSettings((current) => ({ ...current, language }))}
          onAsk={(text) => sendChat(live.id, text)}
          onClose={() => setLive(null)}
        />
      )}

      {view?.kind === 'decisions' && (
        <Panel
          label="Your decision desk"
          onClose={() => setView(null)}
          header={
            <div className="drawer-title">
              <p className="kicker">Your desk</p>
              <h2>Waiting on you</h2>
              <p className="drawer-sub">
                {pending === 0
                  ? 'Nothing needs your call right now.'
                  : `${pending} ${pending === 1 ? 'decision needs' : 'decisions need'} your call.`}
              </p>
            </div>
          }
        >
          <DecisionQueue
            agents={agents}
            decisions={bossDecisions}
            onApprove={approveDecision}
            onDecline={declineDecision}
            filed={filedWork}
            onReopen={reopenDecision}
            showResolved
          />
        </Panel>
      )}

      {memoryPanel && (
        <MemoryPanel
          settings={settings}
          onSave={setSettings}
          onClose={() => setMemoryPanel(false)}
        />
      )}

      {fleet && (
        <FleetPanel
          agents={agents}
          tasks={state.tasks}
          decisions={state.decisions}
          onSave={saveAgent}
          onHire={hireAgent}
          onReset={resetAgent}
          onRemove={removeAgent}
          onClose={() => setFleet(false)}
        />
      )}

      {setup && (
        <SetupModal
          status={status}
          onClose={() => setSetup(false)}
          onRecheck={() => {
            void getStatus().then(setStatus)
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span className="toast-stamp" aria-hidden>
            <Stamp size={16} />
          </span>
          <div>
            <strong>{toast.message}</strong>
            {toast.detail && <span>{toast.detail}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
