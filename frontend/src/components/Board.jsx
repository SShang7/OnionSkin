import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRoom, uid } from '../lib/useRoom.js'
import Stage from './Stage.jsx'
import Timeline from './Timeline.jsx'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'
import HexInput from './HexInput.jsx'

const SWATCHES = ['#111111', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#d6336c', '#868e96']

export default function Board({ room, name, onLeave }) {
  const { doc, version, status, me, users, presence, strokeOp, frameOp, send, onOp } = useRoom(room, name)
  const frames = doc.frames

  const [currentId, setCurrentId] = useState(null)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(SWATCHES[0])
  const [size, setSize] = useState(6)
  const [opacity, setOpacity] = useState(1)
  const [onion, setOnion] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [fps, setFps] = useState(8)
  const [copied, setCopied] = useState(false)

  const currentIndex = Math.max(0, frames.findIndex((f) => f.id === currentId))
  const current = frames[currentIndex]

  const shownIndex = playing ? playIndex % Math.max(1, frames.length) : currentIndex
  const shown = frames[shownIndex]

  const currentFrameId = current?.id
  const currentIdRef = useRef(null)
  useEffect(() => {
    currentIdRef.current = currentFrameId
  })

  // A frame I just added but the server hasn't confirmed yet. Drawing pauses
  // until then so the first stroke doesn't land on the previous frame.
  const pendingSelectRef = useRef(null)
  const [awaitingFrame, setAwaitingFrame] = useState(false)
  useEffect(() => {
    if (!awaitingFrame) return
    const t = setTimeout(() => setAwaitingFrame(false), 2000) // server rejected it (e.g. frame limit)
    return () => clearTimeout(t)
  }, [awaitingFrame])

  useEffect(
    () =>
      onOp((op, before) => {
        // Jump to frames I create once the server confirms them.
        if (op.type === 'frame_add' && op.frameId === pendingSelectRef.current) {
          pendingSelectRef.current = null
          setAwaitingFrame(false)
          setCurrentId(op.frameId)
        }
        // If someone deletes the frame I'm on, move to its neighbour.
        if (op.type === 'frame_delete' && op.frameId === currentIdRef.current) {
          const i = before.frames.findIndex((f) => f.id === op.frameId)
          const neighbour = before.frames[i + 1] ?? before.frames[i - 1]
          if (neighbour) setCurrentId(neighbour.id)
        }
      }),
    [onOp],
  )

  // Tell others which frame I'm on.
  useEffect(() => {
    if (status === 'connected' && currentFrameId) send({ type: 'presence', frameId: currentFrameId })
  }, [status, currentFrameId, send])

  const sendPresence = useCallback(
    (cursor) => send({ type: 'presence', frameId: currentFrameId, ...(cursor ?? {}) }),
    [send, currentFrameId],
  )

  // Playback loop.
  const frameCountRef = useRef(frames.length)
  useEffect(() => {
    frameCountRef.current = frames.length
  })
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setPlayIndex((i) => (i + 1) % Math.max(1, frameCountRef.current)), 1000 / fps)
    return () => clearInterval(t)
  }, [playing, fps])

  // --- actions ---
  const select = (i) => {
    const f = frames[Math.max(0, Math.min(frames.length - 1, i))]
    if (!f) return
    setPlaying(false)
    setCurrentId(f.id)
  }

  const addFrame = (copyFrom) => {
    const frameId = uid()
    pendingSelectRef.current = frameId
    setAwaitingFrame(true)
    setPlaying(false)
    frameOp({ type: 'frame_add', frameId, index: currentIndex + 1, copyFrom })
  }

  const deleteFrame = () => {
    if (current && frames.length > 1) frameOp({ type: 'frame_delete', frameId: current.id })
  }

  const clearFrame = () => {
    if (current?.strokes.length && confirm(`Clear everything on frame ${currentIndex + 1} for everyone?`)) {
      frameOp({ type: 'frame_clear', frameId: current.id })
    }
  }

  const undo = () => {
    if (!current || !me) return
    const mine = current.strokes.findLast((s) => s.by === me.id)
    if (mine) strokeOp({ type: 'stroke_remove', frameId: current.id, strokeId: mine.id })
  }

  const togglePlay = () => {
    if (!playing) setPlayIndex(currentIndex)
    else setCurrentId(frames[shownIndex]?.id ?? currentId)
    setPlaying(!playing)
  }

  const copyInvite = async () => {
    const url = new URL(location.href)
    url.searchParams.set('room', room)
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt('Copy this invite link:', url.toString())
    }
  }

  // Keyboard shortcuts. Read the latest actions through a ref so the listener is attached once.
  const actionsRef = useRef(null)
  useEffect(() => {
    actionsRef.current = { undo, togglePlay, addFrame, duplicate: () => addFrame(current?.id), select, currentIndex }
  })
  useEffect(() => {
    function onKey(e) {
      if (e.target.closest('input, textarea')) return
      const a = actionsRef.current
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        a.undo()
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      } else if (k === ' ') {
        e.preventDefault()
        a.togglePlay()
      } else if (k === 'b' || k === 'p') setTool('pen')
      else if (k === 'e') setTool('eraser')
      else if (k === 'o') setOnion((v) => !v)
      else if (k === 'n') a.addFrame()
      else if (k === 'd') a.duplicate()
      else if (k === ',' || k === 'arrowleft') a.select(a.currentIndex - 1)
      else if (k === '.' || k === 'arrowright') a.select(a.currentIndex + 1)
      else if (k === '[') setSize((s) => Math.max(1, s - 2))
      else if (k === ']') setSize((s) => Math.min(60, s + 2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- presence ---
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const usersByFrame = useMemo(() => {
    const map = {}
    for (const [id, p] of Object.entries(presence)) {
      const user = usersById[id]
      if (!user || !p.frameId) continue
      ;(map[p.frameId] ??= []).push(user)
    }
    if (me && currentFrameId) (map[currentFrameId] ??= []).unshift(me)
    return map
  }, [presence, usersById, me, currentFrameId])

  const cursors = Object.entries(presence)
    .filter(([id, p]) => p.cursor && p.frameId === shown?.id && usersById[id] && id !== me?.id)
    .map(([id, p]) => ({ user: usersById[id], cursor: p.cursor }))

  if (!me) {
    return (
      <div className="loading">
        <Logo size={40} />
        <p>{status === 'disconnected' ? 'Can’t reach the server — retrying…' : `Joining room ${room}…`}</p>
        <button className="btn" onClick={onLeave}>
          Back to lobby
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>OnionSkin</span>
        </div>
        <button className="room-chip" onClick={copyInvite} title="Copy invite link">
          <span className="mono">{room}</span>
          <Icon name="link" size={15} />
          <span className="room-chip-label">{copied ? 'Copied!' : 'Invite'}</span>
        </button>
        <span className={`status status-${status}`} title={status}>
          {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
        </span>
        <div className="spacer" />
        <ul className="avatars" aria-label="People in this room">
          {users.map((u) => (
            <li key={u.id} style={{ '--c': u.color }} title={u.id === me.id ? `${u.name} (you)` : u.name}>
              {u.name.slice(0, 1).toUpperCase()}
            </li>
          ))}
        </ul>
        <button className="btn btn-icon btn-ghost" onClick={onLeave} title="Leave room">
          <Icon name="exit" />
        </button>
      </header>

      <div className="workspace">
        <aside className="toolbar" aria-label="Tools">
          <div className="tool-group">
            <button className={`btn btn-icon ${tool === 'pen' ? 'is-on' : ''}`} onClick={() => setTool('pen')} title="Pen (B)">
              <Icon name="pen" />
            </button>
            <button className={`btn btn-icon ${tool === 'eraser' ? 'is-on' : ''}`} onClick={() => setTool('eraser')} title="Eraser (E)">
              <Icon name="eraser" />
            </button>
          </div>

          <div className="tool-group swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`swatch ${color === c && tool === 'pen' ? 'is-on' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  setColor(c)
                  setTool('pen')
                }}
                aria-label={`Color ${c}`}
              />
            ))}
            <label className="swatch swatch-custom" title="Custom color" style={{ background: SWATCHES.includes(color) ? undefined : color }}>
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value)
                  setTool('pen')
                }}
              />
            </label>
            <HexInput
              value={color}
              onChange={(c) => {
                setColor(c)
                setTool('pen')
              }}
            />
          </div>

          <div className="tool-group size">
            <span className="size-preview-box">
              <span
                className="size-preview"
                style={{ width: Math.min(28, size), height: Math.min(28, size), background: tool === 'pen' ? color : 'var(--muted)', opacity }}
              />
            </span>
            <div className="sliders">
              <label title="Brush size ([ / ])">
                <input type="range" min="1" max="60" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Brush size" />
                <span className="slider-value mono">{size}</span>
              </label>
              <label title="Opacity">
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  aria-label="Opacity"
                />
                <span className="slider-value mono">{Math.round(opacity * 100)}%</span>
              </label>
            </div>
          </div>

          <div className="tool-group">
            <button className="btn btn-icon" onClick={undo} title="Undo my last stroke (Ctrl+Z)">
              <Icon name="undo" />
            </button>
            <button className={`btn btn-icon ${onion ? 'is-on' : ''}`} onClick={() => setOnion((v) => !v)} title="Onion skin (O)">
              <Icon name="onion" />
            </button>
            <button className="btn btn-icon" onClick={clearFrame} title="Clear frame">
              <Icon name="clear" />
            </button>
          </div>
        </aside>

        <Stage
          frame={shown}
          prevFrame={!playing ? frames[shownIndex - 1] : null}
          nextFrame={!playing ? frames[shownIndex + 1] : null}
          onion={onion && !playing}
          version={version}
          tool={tool}
          color={color}
          size={size}
          opacity={opacity}
          disabled={playing || awaitingFrame}
          me={me}
          strokeOp={strokeOp}
          sendPresence={sendPresence}
          cursors={cursors}
        />
      </div>

      <Timeline
        frames={frames}
        currentIndex={currentIndex}
        playing={playing}
        playIndex={shownIndex}
        fps={fps}
        usersByFrame={usersByFrame}
        onSelect={select}
        onAdd={() => addFrame()}
        onDuplicate={() => addFrame(current?.id)}
        onDelete={deleteFrame}
        onMove={(id, index) => frameOp({ type: 'frame_move', frameId: id, index })}
        onTogglePlay={togglePlay}
        onFps={setFps}
      />
    </div>
  )
}
