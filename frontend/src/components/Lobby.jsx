import { useState } from 'react'
import Logo from './Logo.jsx'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I lookalikes

function randomRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export default function Lobby({ initialRoom, initialName, onJoin }) {
  const [name, setName] = useState(initialName)
  const [room, setRoom] = useState(initialRoom)

  const cleanRoom = room.toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const cleanName = name.trim()

  function submit(e) {
    e.preventDefault()
    if (cleanName && cleanRoom) onJoin(cleanRoom, cleanName)
  }

  return (
    <main className="lobby">
      <form className="lobby-card" onSubmit={submit}>
        <div className="lobby-brand">
          <Logo size={44} />
          <div>
            <h1>OnionSkin</h1>
            <p>Draw frame-by-frame animation together, live.</p>
          </div>
        </div>

        <label className="field">
          <span>Your name</span>
          <input
            autoFocus={!initialName}
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sam"
          />
        </label>

        <label className="field">
          <span>Room code</span>
          <div className="field-row">
            <input
              autoFocus={!!initialName}
              maxLength={24}
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              className="mono"
            />
            <button type="button" className="btn" onClick={() => setRoom(randomRoomCode())}>
              New room
            </button>
          </div>
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={!cleanName || !cleanRoom}>
          Join room
        </button>
        <p className="lobby-hint">Anyone with the same room code can draw on the board and add frames.</p>
      </form>
    </main>
  )
}
