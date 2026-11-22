import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Logo from './Logo.jsx'
import Icon from './Icon.jsx'
import DailyPrompt from './DailyPrompt.jsx'
import { formatDay } from '../lib/daily.js'

const timeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function timeAgo(ms) {
  const sec = Math.round((ms - Date.now()) / 1000)
  const abs = Math.abs(sec)
  if (abs < 60) return 'just now'
  if (abs < 3600) return timeFormat.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return timeFormat.format(Math.round(sec / 3600), 'hour')
  if (abs < 86400 * 30) return timeFormat.format(Math.round(sec / 86400), 'day')
  return new Date(ms).toLocaleDateString()
}

function ProjectCard({ project, onOpen, onRename, onDelete }) {
  return (
    <li className="project-card">
      <button className="project-open" onClick={() => onOpen(project.id)}>
        <div className="project-thumb">
          {project.thumbnail ? <img src={project.thumbnail} alt="" /> : null}
          {project.daily_date && (
            <span className="daily-badge">
              <Icon name="sparkle" size={12} /> Daily · {formatDay(project.daily_date, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        <div className="project-meta">
          <strong>{project.title}</strong>
          <span>
            {project.frame_count} {project.frame_count === 1 ? 'frame' : 'frames'} · {project.owned ? 'edited' : `by ${project.owner_name} ·`}{' '}
            {timeAgo(project.updated_at)}
          </span>
        </div>
      </button>
      <div className="project-actions">
        {project.owned ? (
          <button className="btn btn-icon btn-ghost" onClick={() => onRename(project)} title="Rename" aria-label={`Rename ${project.title}`}>
            <Icon name="pen" size={16} />
          </button>
        ) : null}
        <button
          className="btn btn-icon btn-ghost btn-danger"
          onClick={() => onDelete(project)}
          title={project.owned ? 'Delete' : 'Remove from my list'}
          aria-label={project.owned ? `Delete ${project.title}` : `Remove ${project.title} from my list`}
        >
          <Icon name={project.owned ? 'trash' : 'clear'} size={16} />
        </button>
      </div>
    </li>
  )
}

export default function Projects({ account, onOpen, onSignOut }) {
  const [lists, setLists] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => api.listProjects().then(setLists, (err) => setError(err.message)), [])
  useEffect(() => {
    load()
  }, [load])

  async function create() {
    setCreating(true)
    try {
      const project = await api.createProject()
      onOpen(project.id)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  async function rename(project) {
    const title = prompt('Rename project', project.title)?.trim()
    if (!title || title === project.title) return
    try {
      await api.renameProject(project.id, title)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function remove(project) {
    const question = project.owned
      ? `Delete “${project.title}” for everyone? This can’t be undone.`
      : `Remove “${project.title}” from your list? You can open it again from its invite link.`
    if (!confirm(question)) return
    try {
      await api.deleteProject(project.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="projects-page">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>OnionSkin</span>
        </div>
        <div className="spacer" />
        <span className="account-name">{account.username}</span>
        <button className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="projects-main">
        <DailyPrompt signedIn onOpen={onOpen} />

        <div className="projects-heading">
          <h1>Your projects</h1>
          <button className="btn btn-primary" onClick={create} disabled={creating}>
            <Icon name="plus" size={16} /> New project
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {!lists && !error && <p className="muted">Loading…</p>}

        {lists && (
          <>
            {lists.owned.length === 0 ? (
              <div className="empty-state">
                <p>No projects yet. Start one and invite your friends to draw with you.</p>
                <button className="btn btn-primary" onClick={create} disabled={creating}>
                  <Icon name="plus" size={16} /> New project
                </button>
              </div>
            ) : (
              <ul className="project-grid">
                {lists.owned.map((p) => (
                  <ProjectCard key={p.id} project={p} onOpen={onOpen} onRename={rename} onDelete={remove} />
                ))}
              </ul>
            )}

            {lists.shared.length > 0 && (
              <>
                <h2>Shared with you</h2>
                <ul className="project-grid">
                  {lists.shared.map((p) => (
                    <ProjectCard key={p.id} project={p} onOpen={onOpen} onRename={rename} onDelete={remove} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
