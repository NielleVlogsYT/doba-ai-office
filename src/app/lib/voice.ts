import { MAX_UTTERANCE_MS, VOICE_SILENCE_MS, type VoiceLanguage } from '../../shared/config'

/**
 * One spoken turn from the microphone. Records until the speaker pauses, then
 * resolves with the audio, so a live conversation can loop without a push-to-talk key.
 */
export type Utterance = {
  /** Resolves when the turn ends. Empty audio means nothing was captured. */
  done: Promise<Blob>
  stop: () => void
  cancel: () => void
}

const LOUD = 0.06
/** A turn with no speech in it gives up rather than holding the mic open. */
const NO_SPEECH_MS = 8_000

export async function recordUtterance(onLevel: (level: number) => void): Promise<Utterance> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Uint8Array(analyser.fftSize)

  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  let settle: (blob: Blob) => void = () => {}
  const done = new Promise<Blob>((resolve) => {
    settle = resolve
  })

  const release = () => {
    stream.getTracks().forEach((track) => track.stop())
    void context.close().catch(() => {})
  }

  recorder.onstop = () => {
    release()
    settle(new Blob(chunks, { type: mime ?? 'audio/webm' }))
  }
  recorder.start(200)

  let heard = false
  let quietSince: number | null = null
  const startedAt = performance.now()

  // A timer, not a frame loop: a tab that is not painting must still end the turn.
  const tick = () => {
    if (recorder.state !== 'recording') return
    analyser.getByteTimeDomainData(samples)
    let peak = 0
    for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i] - 128) / 128)
    onLevel(peak)

    const now = performance.now()
    if (peak > LOUD) {
      heard = true
      quietSince = null
    } else if (quietSince === null) {
      quietSince = now
    }
    const quietFor = quietSince === null ? 0 : now - quietSince
    if ((heard && quietFor > VOICE_SILENCE_MS) || now - startedAt > MAX_UTTERANCE_MS || (!heard && now - startedAt > NO_SPEECH_MS)) {
      recorder.stop()
    }
  }
  const timer = window.setInterval(tick, 80)
  // The watchdog ends the turn even if the tab throttles timers to a crawl.
  const watchdog = window.setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, MAX_UTTERANCE_MS + 1_000)

  const clean = () => {
    window.clearInterval(timer)
    window.clearTimeout(watchdog)
  }

  recorder.addEventListener('stop', clean, { once: true })

  return {
    done,
    stop: () => {
      clean()
      if (recorder.state === 'recording') recorder.stop()
    },
    cancel: () => {
      clean()
      if (recorder.state === 'recording') recorder.stop()
      else release()
    },
  }
}

/** Strips Markdown and the decision tag so a reply reads cleanly aloud. */
export function speakable(markdown: string): string {
  return markdown
    .replace(/<decision>[\s\S]*?<\/decision>/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+]\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Which voice will actually read a reply, and whether it speaks the language asked for.
 * `exact: false` means the browser has no voice for that language and English will
 * take over — the live panel says so rather than letting a reply drift into English.
 */
export type VoiceChoice = {
  voice?: SpeechSynthesisVoice
  exact: boolean
}

const englishVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined =>
  voices.find((voice) => /^en[-_]PH/i.test(voice.lang)) ??
  voices.find((voice) => /^en[-_]GB/i.test(voice.lang)) ??
  voices.find((voice) => /^en/i.test(voice.lang)) ??
  voices[0]

/**
 * The browser's own speech synthesis: free, offline, and the one place a Filipino
 * voice is likely to exist. Never quietly substitutes English for Tagalog without
 * saying so — the choice reports whether it matched.
 */
export function chooseVoice(language: VoiceLanguage): VoiceChoice {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return { exact: false }
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return { exact: false }
  if (language === 'tl') {
    const filipino =
      voices.find((voice) => /^(fil|tl)[-_]/i.test(voice.lang)) ??
      voices.find((voice) => /^(fil|tl)/i.test(voice.lang))
    if (filipino) return { voice: filipino, exact: true }
    return { voice: englishVoice(voices), exact: false }
  }
  const english =
    voices.find((voice) => /^en[-_]PH/i.test(voice.lang)) ??
    voices.find((voice) => /^en[-_]GB/i.test(voice.lang)) ??
    voices.find((voice) => /^en/i.test(voice.lang))
  return { voice: english, exact: true }
}

/** Speaks one reply. Resolves when the voice stops, so live mode can listen again. */
export function speak(text: string, language: VoiceLanguage): Promise<void> {
  const clean = speakable(text)
  if (!clean || typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve()
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  const choice = chooseVoice(language)
  // An English voice reading a fil-PH utterance mangles the words, so the fallback
  // is spoken as plain English instead.
  utterance.lang = language === 'tl' && choice.exact ? 'fil-PH' : 'en-US'
  if (choice.voice) utterance.voice = choice.voice
  utterance.rate = 1.02
  return new Promise((resolve) => {
    const finish = () => resolve()
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
  })
}

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}
