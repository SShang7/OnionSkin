import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatDay, localDate } from '../lib/daily.js'
import Icon from './Icon.jsx'

function streakText({ streak, project }) {
  const doneToday = !!project?.drawn
  if (streak === 0) return 'Draw today to start a streak'
  const days = `${streak}-day streak`
  return doneToday ? days : `${days} · draw today to keep it`
}

/**
 * Today's drawing prompt. Everyone gets the same one each day.
 * Signed in: a button to start (or reopen) today's project, plus your streak.
 */
export default function DailyPrompt({ signedIn, onOpen }) {
  const [date, setDate] = useState(localDate)
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.daily(date).then(
      (s) => !cancelled && setState(s),
      (err) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [date])

  // A tab left open overnight picks up the new prompt when you come back to it.
  useEffect(() => {
    const check = () => document.visibilityState === 'visible' && setDate(localDate())
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  async function start() {
    setStarting(true)
    try {
      const next = await api.startDaily(date)
      onOpen(next.project.id)
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }

  if (error && !state) return null
  const current = state?.date === date ? state : null

  return (
    <section className={`daily-card ${signedIn ? '' : 'is-compact'}`} aria-labelledby="daily-label">
      <div className="daily-text">
        <p className="daily-label" id="daily-label">
          <Icon name="sparkle" size={14} />
          Today’s prompt · {formatDay(date)}
        </p>
        <p className="daily-prompt">{current ? current.prompt : ' '}</p>
        {!signedIn && <p className="daily-hint">Everyone gets the same prompt. Sign in to draw it and build a streak.</p>}
      </div>

      {signedIn && current && (
        <div className="daily-side">
          <ol className="daily-week" aria-label="Last 7 days">
            {current.week.map((d) => (
              <li
                key={d.date}
                className={`${d.done ? 'is-done' : ''} ${d.date === date ? 'is-today' : ''}`}
                title={`${formatDay(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}: ${d.done ? 'drawn' : 'not drawn'}`}
              >
                <span className="daily-dot">{d.done && <Icon name="check" size={12} />}</span>
                <span className="daily-day" aria-hidden="true">
                  {formatDay(d.date, { weekday: 'narrow' })}
                </span>
              </li>
            ))}
          </ol>
          <p className={`daily-streak ${current.streak > 0 ? 'is-active' : ''}`}>
            <Icon name="flame" size={15} />
            {streakText(current)}
          </p>
          <button className="btn btn-primary daily-button" onClick={start} disabled={starting}>
            {current.project?.drawn ? (
              <>
                <Icon name="check" size={16} /> Open today’s drawing
              </>
            ) : current.project ? (
              'Keep drawing'
            ) : (
              <>
                <Icon name="pen" size={16} /> Start drawing
              </>
            )}
          </button>
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </section>
  )
}
