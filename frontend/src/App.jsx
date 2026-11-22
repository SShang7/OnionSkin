import { useState } from 'react'
import Lobby from './components/Lobby.jsx'
import Board from './components/Board.jsx'
import './App.css'

const NAME_KEY = 'onionskin.name'

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function setRoomInUrl(room) {
  const url = new URL(location.href)
  if (room) url.searchParams.set('room', room)
  else url.searchParams.delete('room')
  history.replaceState(null, '', url)
}

export default function App() {
  const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? ''
  const savedName = readName()
  // An invite link plus a remembered name drops you straight into the room.
  const [session, setSession] = useState(() => (urlRoom && savedName ? { room: urlRoom, name: savedName } : null))

  function join(room, name) {
    try {
      localStorage.setItem(NAME_KEY, name)
    } catch {
      /* private mode */
    }
    setRoomInUrl(room)
    setSession({ room, name })
  }

  function leave() {
    setRoomInUrl(null)
    setSession(null)
  }

  if (!session) return <Lobby initialRoom={urlRoom} initialName={savedName} onJoin={join} />
  return <Board key={session.room} room={session.room} name={session.name} onLeave={leave} />
}
