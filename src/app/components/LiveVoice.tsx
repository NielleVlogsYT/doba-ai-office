import { Loader2, Mic, Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { VOICE_LANGUAGES, type Agent, type VoiceLanguage } from '../../shared/config'
import { transcribeAudio } from '../lib/api'
import { cx } from '../lib/format'
import { chooseVoice, recordUtterance, speak, stopSpeaking, type Utterance } from '../lib/voice'
import { Panel } from './Panel'

type Line = { id: string; from: 'you' | 'agent'; text: string }
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

const PHASE_TEXT: Record<Phase, string> = {
  idle: 'Ready when you are',
  listening: 'Listening… pause when you are done',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
}

type Props = {
  agent: Agent
  ai: boolean
  /** The one language setting, shared with the prompts and the transcriptions. */
  language: VoiceLanguage
  onLanguage: (next: VoiceLanguage) => void
  /** Sends one spoken turn and resolves with the desk's reply. */
  onAsk: (text: string) => Promise<string | null>
  onClose: () => void
}

/**
 * Live conversation: record a turn, transcribe it, let the desk answer, speak the
 * answer, then listen again. The language is the office setting — the toggle here
 * edits the same value, so transcription, the reply and the voice always agree.
 */
export function LiveVoice({ agent, ai, language, onLanguage, onAsk, onClose }: Props) {
  const languageRef = useRef<VoiceLanguage>(language)
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  /** True once the browser has voices and none of them speak the chosen language. */
  const [voiceFallback, setVoiceFallback] = useState(false)
  const [running, setRunning] = useState(false)

  const runningRef = useRef(false)
  const aliveRef = useRef(true)
  const turnRef = useRef<Utterance | null>(null)
  const empties = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    languageRef.current = language
  }, [language])

  // Some browsers only populate the voice list after a beat, so the check runs again
  // whenever it changes. `speech` stays unchecked until there is a list to look at.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const check = () => {
      if (window.speechSynthesis.getVoices().length === 0) return
      setVoiceFallback(!chooseVoice(language).exact)
    }
    check()
    window.speechSynthesis.addEventListener('voiceschanged', check)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check)
  }, [language])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [lines, phase])

  const halt = () => {
    runningRef.current = false
    setRunning(false)
    turnRef.current?.cancel()
    turnRef.current = null
    stopSpeaking()
    setLevel(0)
    setPhase('idle')
  }

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      runningRef.current = false
      turnRef.current?.cancel()
      stopSpeaking()
    }
  }, [])

  const addLine = (from: Line['from'], text: string) =>
    setLines((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, from, text }])

  const listen = async () => {
    if (!runningRef.current || !aliveRef.current) return
    setPhase('listening')
    setProblem(null)

    let turn: Utterance
    try {
      turn = await recordUtterance(setLevel)
    } catch {
      setProblem('The microphone is blocked. Allow mic access in the browser, then start again.')
      halt()
      return
    }
    turnRef.current = turn
    const audio = await turn.done
    turnRef.current = null
    setLevel(0)
    if (!runningRef.current || !aliveRef.current) return

    // A cancelled or silent turn leaves only a header's worth of bytes.
    if (audio.size < 1500) {
      empties.current += 1
      if (empties.current >= 2) {
        setProblem('Nothing reached the microphone. Check which one is selected, then start again.')
        halt()
        return
      }
      void listen()
      return
    }
    empties.current = 0

    setPhase('thinking')
    try {
      const heard = await transcribeAudio(audio, languageRef.current)
      addLine('you', heard)
      const reply = await onAsk(heard)
      if (!runningRef.current || !aliveRef.current) return
      if (reply) {
        addLine('agent', reply)
        setPhase('speaking')
        await speak(reply, languageRef.current)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That turn did not go through.'
      // "Nothing in that recording" is a silent microphone, not a broken office line.
      if (/nothing (recognisable|was picked up)/i.test(message)) {
        empties.current += 1
        if (empties.current >= 3) {
          setProblem('The microphone is picking up no speech. Check the input device, then start again.')
          halt()
          return
        }
      } else {
        setProblem(message)
      }
    }
    if (runningRef.current && aliveRef.current) void listen()
  }

  const start = () => {
    if (!ai) {
      setProblem('Live conversation needs a working API key. Add one and start again.')
      return
    }
    runningRef.current = true
    setRunning(true)
    setProblem(null)
    void listen()
  }

  return (
    <Panel
      label={`Live conversation with ${agent.name}`}
      onClose={() => {
        halt()
        onClose()
      }}
      header={
        <div className="live-head">
          <span className="agent-portrait" style={{ background: agent.tint, color: agent.color }}>
            {agent.name.slice(0, 1)}
          </span>
          <div className="live-head-text">
            <p className="kicker">Live conversation</p>
            <h2>{agent.name}</h2>
            <p className="agent-title">{agent.desk}</p>
          </div>
        </div>
      }
      footer={
        <div className="live-foot">
          <div className="live-langs" role="group" aria-label="Conversation language">
            {VOICE_LANGUAGES.map((option) => (
              <button
                key={option.id}
                className={cx('live-lang', language === option.id && 'is-active')}
                aria-pressed={language === option.id}
                onClick={() => onLanguage(option.id)}
                disabled={running}
              >
                {option.label}
              </button>
            ))}
          </div>
          {running ? (
            <button className="btn live-stop" onClick={halt}>
              <Square size={15} />
              Stop
            </button>
          ) : (
            <button className="btn primary live-start" onClick={start}>
              <Mic size={15} />
              Start talking
            </button>
          )}
        </div>
      }
    >
      <div className={cx('live-stage', `is-${phase}`)}>
        <div className="live-orb" aria-hidden>
          <span className="live-orb-core" style={{ transform: `scale(${(1 + Math.min(level, 1) * 0.5).toFixed(2)})` }} />
        </div>
        <p className="live-phase">
          {phase === 'thinking' && <Loader2 size={14} className="spin" />}
          {phase === 'speaking' && <Volume2 size={14} />}
          {PHASE_TEXT[phase]}
        </p>
        <span className="live-meter" aria-hidden>
          <span style={{ width: `${Math.round(Math.min(level, 1) * 100)}%` }} />
        </span>
      </div>

      {problem && (
        <p className="live-problem" role="alert">
          {problem}
        </p>
      )}

      {voiceFallback && (
        <p className="live-voice-note" role="status">
          No Tagalog voice is installed in this browser, so replies are read in English. Add a Filipino voice in your
          system speech settings to hear them in Tagalog.
        </p>
      )}

      <div className="live-log" ref={logRef}>
        {lines.length === 0 ? (
          <p className="live-empty">
            Speak naturally, then pause. {agent.name} answers out loud, so the room stays hands-free. Everything said
            here is also filed in the desk's chat.
          </p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={cx('msg', line.from === 'you' ? 'from-you' : 'from-agent')}>
              <p className="msg-text">{line.text}</p>
            </div>
          ))
        )}
      </div>

      <p className="composer-note">
        Speech to text runs on Whisper; replies are spoken by your browser's own voice. No audio is stored.
      </p>
    </Panel>
  )
}
