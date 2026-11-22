import { useState } from 'react'
import { api } from '../lib/api.js'

/** Sign in / create account form. Calls onSignedIn(user) on success. */
export default function AuthForm({ onSignedIn, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = isSignup ? await api.signUp(username.trim(), password) : await api.logIn(username.trim(), password)
      onSignedIn(user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? 'is-on' : ''} onClick={() => setMode('login')}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'is-on' : ''} onClick={() => setMode('signup')}>
          Create account
        </button>
      </div>

      <label className="field">
        <span>Username</span>
        <input
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          minLength={isSignup ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {isSignup && <small className="field-hint">At least 8 characters.</small>}
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
      </button>
    </form>
  )
}
