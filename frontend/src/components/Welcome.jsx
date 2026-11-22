import Logo from './Logo.jsx'
import AuthForm from './AuthForm.jsx'

/** Landing page for signed-out visitors. */
export default function Welcome({ onSignedIn }) {
  return (
    <main className="centered-page">
      <div className="card">
        <div className="card-brand">
          <Logo size={44} />
          <div>
            <h1>OnionSkin</h1>
            <p>Draw frame-by-frame animation together, live.</p>
          </div>
        </div>
        <AuthForm onSignedIn={onSignedIn} />
        <p className="card-hint">Got an invite link? Open it to join a project, with or without an account.</p>
      </div>
    </main>
  )
}
