import { useEffect, useState } from 'react'
import { api } from './lib/api.js'
import Welcome from './components/Welcome.jsx'
import Projects from './components/Projects.jsx'
import GuestJoin from './components/GuestJoin.jsx'
import Board from './components/Board.jsx'
import Logo from './components/Logo.jsx'
import './App.css'

/** The only route is ?project=ID; everything else is the home page. */
function projectFromUrl() {
  return new URLSearchParams(location.search).get('project')?.toUpperCase() || null
}

export default function App() {
  const [account, setAccount] = useState(undefined) // undefined = still checking, null = signed out
  const [projectId, setProjectId] = useState(projectFromUrl)
  const [guestName, setGuestName] = useState(null)

  useEffect(() => {
    api.me().then(setAccount, () => setAccount(null))
    const onPop = () => setProjectId(projectFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function open(id) {
    history.pushState(null, '', id ? `/?project=${id}` : '/')
    setProjectId(id)
  }

  async function signOut() {
    await api.logOut().catch(() => {})
    setAccount(null)
    setGuestName(null)
  }

  if (account === undefined) {
    return (
      <div className="loading">
        <Logo size={40} />
      </div>
    )
  }

  if (projectId) {
    if (account || guestName) {
      return (
        <Board
          key={`${projectId}:${account?.id ?? guestName}`}
          projectId={projectId}
          guestName={account ? null : guestName}
          signedIn={!!account}
          onExit={() => open(null)}
        />
      )
    }
    return <GuestJoin projectId={projectId} onGuest={setGuestName} onSignedIn={setAccount} onCancel={() => open(null)} />
  }

  if (!account) return <Welcome onSignedIn={setAccount} />
  return <Projects account={account} onOpen={open} onSignOut={signOut} />
}
