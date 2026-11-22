import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

const PRESETS = [30, 60, 120, 300, 600] // seconds
const MIN_S = 5
const MAX_S = 60 * 60
const DONE_SHOW_MS = 5000

function loadSettings() {
  try {
    return { repeat: false, newFrame: true, sound: true, ...JSON.parse(localStorage.getItem('onionskin.timer') ?? '{}') }
  } catch {
    return { repeat: false, newFrame: true, sound: true }
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem('onionskin.timer', JSON.stringify(settings))
  } catch {
    // Not saved between visits; that's fine.
  }
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const presetLabel = (s) => (s < 60 ? `${s}s` : `${s / 60} min`)

/** "1:30" → 90, "45s" → 45, "2" or "2m" → 120. Null if it can't be read. */
function parseDuration(text) {
  const t = text.trim().toLowerCase()
  let seconds
  if (/^\d{1,2}:\d{1,2}$/.test(t)) {
    const [m, s] = t.split(':').map(Number)
    seconds = m * 60 + s
  } else if (/^\d+(\.\d+)?\s*s(ec)?$/.test(t)) seconds = parseFloat(t)
  else if (/^\d+(\.\d+)?\s*(m|min)?$/.test(t)) seconds = parseFloat(t) * 60
  else return null
  return Math.round(seconds)
}

let audio = null
/** A short two-note chime, made with Web Audio so there's no sound file to load. */
function chime(times = 1) {
  try {
    audio ??= new AudioContext()
    audio.resume()
    const start = audio.currentTime + 0.02
    for (let i = 0; i < times; i++) {
      for (const [offset, freq] of [
        [0, 880],
        [0.14, 1320],
      ]) {
        const t = start + i * 0.45 + offset
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
        osc.connect(gain).connect(audio.destination)
        osc.start(t)
        osc.stop(t + 0.4)
      }
    }
  } catch {
    // No audio available; the visual cue still shows.
  }
}

/**
 * A countdown everyone in the project shares, for gesture drawing and other
 * timed exercises. Anyone can start, pause or stop it.
 */
export default function TimerControl({ timer, timerEvent, send }) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState(false)
  const [now, setNow] = useState(Date.now)
  const rootRef = useRef(null)

  const update = (patch) =>
    setSettings((s) => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })

  // Re-render a few times a second while counting down.
  const running = !!timer?.running
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running])

  // Chime at the end of each round, and flash "Time's up" when it's over.
  const soundRef = useRef(settings.sound)
  useEffect(() => {
    soundRef.current = settings.sound
  })
  useEffect(() => {
    if (!timerEvent) return
    if (soundRef.current && timerEvent.type === 'done') chime(3)
    if (soundRef.current && timerEvent.type === 'round') chime(1)
    if (timerEvent.type !== 'done') return
    // Re-render once the "Time's up" flash is over.
    const t = setTimeout(() => setNow(Date.now()), DONE_SHOW_MS + 50)
    return () => clearTimeout(t)
  }, [timerEvent])
  const done = timerEvent?.type === 'done' && now - timerEvent.at < DONE_SHOW_MS

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const start = (duration, options = settings) => {
    // Unlock audio while we have a click, so the chime can play later.
    if (settings.sound) {
      try {
        audio ??= new AudioContext()
        audio.resume()
      } catch {
        // ignore
      }
    }
    send({ type: 'timer_start', duration, repeat: options.repeat, newFrame: options.newFrame })
    setOpen(false)
  }

  const startCustom = (e) => {
    e.preventDefault()
    const seconds = parseDuration(custom)
    if (!seconds || seconds < MIN_S || seconds > MAX_S) {
      setCustomError(true)
      return
    }
    setCustomError(false)
    start(seconds)
  }

  // `now` can lag a fraction of a second behind a fresh timer, so clamp to the full duration.
  const remaining = timer
    ? timer.running
      ? Math.min(timer.duration * 1000, Math.max(0, timer.endsAt - now))
      : timer.remaining
    : 0
  const progress = timer ? 1 - remaining / (timer.duration * 1000) : 0
  const low = timer?.running && remaining <= 5000

  let label
  if (timer) label = formatTime(remaining)
  else if (done) label = 'Time’s up!'
  else label = 'Timer'

  const title = timer
    ? `${timer.running ? 'Running' : 'Paused'}${timer.repeat ? `, round ${timer.round}` : ''} · set by ${timer.setBy}`
    : 'Countdown timer for timed drawing'

  return (
    <div className="timer" ref={rootRef}>
      <button
        className={`btn timer-button ${timer ? 'is-active' : ''} ${timer && !timer.running ? 'is-paused' : ''} ${low ? 'is-low' : ''} ${done && !timer ? 'is-done' : ''}`}
        style={{ '--progress': progress }}
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name={timer && !timer.running ? 'pause' : 'timer'} size={15} />
        <span className={`timer-label ${timer ? 'mono' : ''}`}>{label}</span>
        {timer?.repeat && <span className="timer-round">#{timer.round}</span>}
      </button>

      {open && (
        <div className="timer-pop" role="dialog" aria-label="Timer">
          {timer ? (
            <>
              <div className="timer-big mono" aria-live="off">
                {formatTime(remaining)}
              </div>
              <p className="timer-meta">
                {timer.running ? 'Running' : 'Paused'} · {presetLabel(timer.duration)}
                {timer.repeat ? ` rounds · round ${timer.round}` : ''}
                {timer.newFrame ? ' · new frame each round' : ''}
                <br />
                Started by {timer.setBy}
              </p>
              <div className="timer-actions">
                {timer.running ? (
                  <button className="btn" onClick={() => send({ type: 'timer_pause' })}>
                    <Icon name="pause" size={15} /> Pause
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => send({ type: 'timer_resume' })}>
                    <Icon name="play" size={15} /> Resume
                  </button>
                )}
                <button className="btn" onClick={() => start(timer.duration, timer)} title="Start the countdown over from round 1">
                  <Icon name="undo" size={15} /> Restart
                </button>
                <button className="btn btn-danger" onClick={() => send({ type: 'timer_stop' })}>
                  <Icon name="stop" size={15} /> Stop
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="timer-heading">Start a timer for everyone</p>
              <div className="timer-presets">
                {PRESETS.map((s) => (
                  <button key={s} className="btn" onClick={() => start(s)}>
                    {presetLabel(s)}
                  </button>
                ))}
              </div>
              <form className="timer-custom" onSubmit={startCustom}>
                <input
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value)
                    setCustomError(false)
                  }}
                  placeholder="Custom, e.g. 1:30"
                  aria-label="Custom time (minutes, m:ss, or seconds like 45s)"
                  aria-invalid={customError}
                  className={customError ? 'is-invalid' : undefined}
                />
                <button className="btn btn-primary" type="submit" disabled={!custom.trim()}>
                  Start
                </button>
              </form>
              {customError && <p className="timer-error">Enter 5 seconds to 60 minutes, like 90s, 1:30 or 2.</p>}
              <label className="timer-option">
                <input type="checkbox" checked={settings.repeat} onChange={(e) => update({ repeat: e.target.checked })} />
                <span>
                  <Icon name="repeat" size={14} /> Repeat rounds
                </span>
              </label>
              <label className={`timer-option is-sub ${settings.repeat ? '' : 'is-disabled'}`}>
                <input
                  type="checkbox"
                  checked={settings.newFrame}
                  disabled={!settings.repeat}
                  onChange={(e) => update({ newFrame: e.target.checked })}
                />
                <span>New frame each round</span>
              </label>
            </>
          )}
          <label className="timer-option timer-sound">
            <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
            <span>Chime when time’s up (just for you)</span>
          </label>
        </div>
      )}
    </div>
  )
}
