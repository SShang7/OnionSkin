import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Logo from './Logo.jsx'
import AuthForm from './AuthForm.jsx'

const NAME_KEY = 'onionskin.guestName'

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Shown when a signed-out visitor opens an invite link. */
export default function GuestJoin({ projectId, onGuest, onSignedIn, onCancel }) {
  const [project, setProject] = useState(null)
  const [error, setError] = useState(null)
  const [name, setName] = useState(savedName)

  useEffect(() => {
    api.getProject(projectId).then(setProject, (err) => setError(err.status === 404 ? 'This project doesn’t exist or was deleted.' : err.message))
  }, [projectId])

  function joinAsGuest(e) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    try {
      localStorage.setItem(NAME_KEY, clean)
    } catch {
      /* private mode */
    }
    onGuest(clean)
  }

  if (error) {
    return (
      <main className="centered-page">
        <div className="card">
          <Logo size={40} />
          <p>{error}</p>
          <button className="btn btn-primary btn-block" onClick={onCancel}>
            Go to OnionSkin
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="centered-page">
      <div className="card">
        <div className="card-brand">
          <Logo size={44} />
          <div>
            <p className="eyebrow">You’re invited to animate</p>
            <h1>{project ? project.title : '…'}</h1>
            {project && <p>by {project.ownerName}</p>}
          </div>
        </div>

        <form className="guest-form" onSubmit={joinAsGuest}>
          <label className="field">
            <span>Join as a guest</span>
            <div className="field-row">
              <input maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
              <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                Join
              </button>
            </div>
          </label>
        </form>

        <div className="divider">
          <span>or sign in to keep it in your projects</span>
        </div>
        <AuthForm onSignedIn={onSignedIn} />
      </div>
    </main>
  )
}
