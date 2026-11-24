import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRoom, uid } from '../lib/useRoom.js'
import { api } from '../lib/api.js'
import { renderThumbnail } from '../lib/render.js'
import Stage from './Stage.jsx'
import Timeline from './Timeline.jsx'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'
import ColorPicker from './ColorPicker.jsx'
import ProjectTitle from './ProjectTitle.jsx'
import TimerControl from './TimerControl.jsx'
import ExportGif from './ExportGif.jsx'
import { formatDay } from '../lib/daily.js'

const SWATCHES = ['#111111', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#d6336c', '#868e96']
const THUMBNAIL_DELAY_MS = 3000

export default function Board({ projectId, guestName, signedIn, onExit }) {
  const { doc, version, status, me, users, presence, project, setProject, fatal, savedAt, unsaved, timer, timerEvent, strokeOp, frameOp, send, onOp } =
    useRoom(projectId, guestName)
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
  const [loop, setLoop] = useState(true)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

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
        // A new timer round added a frame: everyone moves to it for the next pose.
        if (op.type === 'frame_add' && op.timer) {
          setPlaying(false)
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

  // Playback. With looping off, it stops on the last frame.
  const playbackRef = useRef(null)
  useEffect(() => {
    playbackRef.current = { frames, loop, playIndex }
  })
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      const { frames, loop, playIndex } = playbackRef.current
      const next = playIndex + 1
      if (next < frames.length) setPlayIndex(next)
      else if (loop) setPlayIndex(0)
      else {
        // Played through once: stop and stay on the last frame.
        setPlaying(false)
        setCurrentId(frames.at(-1)?.id ?? null)
      }
    }, 1000 / fps)
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
    // Without looping, pressing play on the last frame starts again from the first.
    if (!playing) setPlayIndex(!loop && currentIndex === frames.length - 1 ? 0 : currentIndex)
    else setCurrentId(frames[shownIndex]?.id ?? currentId)
    setPlaying(!playing)
  }

  const rename = async (title) => {
    const previous = project.title
    setProject((p) => ({ ...p, title }))
    try {
      await api.renameProject(projectId, title)
    } catch (err) {
      setProject((p) => ({ ...p, title: previous }))
      alert(err.message)
    }
  }

  // Keep the project's cover image (frame 1) up to date for the projects page.
  const firstFrame = frames[0]
  const thumbKeyRef = useRef(null)
  useEffect(() => {
    if (!firstFrame || status !== 'connected') return
    const key = `${firstFrame.id}:${firstFrame.rev}`
    if (thumbKeyRef.current === null) {
      thumbKeyRef.current = key // what we loaded is already the saved cover
      return
    }
    if (thumbKeyRef.current === key) return
    const t = setTimeout(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 180
      renderThumbnail(canvas, firstFrame)
      send({ type: 'thumbnail', dataUrl: canvas.toDataURL('image/jpeg', 0.75) })
      thumbKeyRef.current = key
    }, THUMBNAIL_DELAY_MS)
    return () => clearTimeout(t)
  }, [firstFrame, firstFrame?.rev, version, status, send])

  const copyInvite = async () => {
    const url = new URL(location.origin)
    url.searchParams.set('project', projectId)
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
      else if (k === 'l') setLoop((v) => !v)
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

  // --- presence (keyed by connection, so one account in two tabs shows twice) ---
  const usersByCid = useMemo(() => Object.fromEntries(users.map((u) => [u.cid, u])), [users])
  const usersByFrame = useMemo(() => {
    const map = {}
    for (const [cid, p] of Object.entries(presence)) {
      const user = usersByCid[cid]
      if (!user || !p.frameId || cid === me?.cid) continue
      ;(map[p.frameId] ??= []).push(user)
    }
    if (me && currentFrameId) (map[currentFrameId] ??= []).unshift(me)
    return map
  }, [presence, usersByCid, me, currentFrameId])

  const cursors = Object.entries(presence)
    .filter(([cid, p]) => p.cursor && p.frameId === shown?.id && usersByCid[cid] && cid !== me?.cid)
    .map(([cid, p]) => ({ user: usersByCid[cid], cursor: p.cursor }))

  const exitLabel = signedIn ? 'Projects' : 'Home'

  if (fatal) {
    return (
      <div className="loading">
        <Logo size={40} />
        <p>{fatal.message}</p>
        <button className="btn btn-primary" onClick={onExit}>
          Back to {exitLabel.toLowerCase()}
        </button>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="loading">
        <Logo size={40} />
        <p>{status === 'disconnected' ? 'Can’t reach the server — retrying…' : 'Opening project…'}</p>
        <button className="btn" onClick={onExit}>
          Back to {exitLabel.toLowerCase()}
        </button>
      </div>
    )
  }

  const saveLabel = status !== 'connected' ? 'Offline — changes paused' : unsaved ? 'Saving…' : savedAt ? 'Saved' : 'All changes saved'

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn btn-ghost back-button" onClick={onExit} title={`Back to ${exitLabel.toLowerCase()}`}>
          <Icon name="prev" size={16} />
          <Logo size={22} />
        </button>
        <div className="title-block">
          <ProjectTitle title={project.title} editable={project.isOwner} onRename={rename} />
          <span className={`status status-${status}`} title={savedAt ? `Last saved ${new Date(savedAt).toLocaleTimeString()}` : undefined}>
            {saveLabel}
            {!project.isOwner && <span className="owner-note"> · by {project.ownerName}</span>}
          </span>
        </div>
        {project.daily && (
          <div className="prompt-pill" title={`Daily prompt for ${formatDay(project.daily.date)}`}>
            <Icon name="sparkle" size={14} />
            <span>
              <span className="prompt-pill-label">Daily prompt · </span>
              {/* The title starts out as the prompt; once renamed, show the prompt here instead. */}
              {project.title === project.daily.prompt ? formatDay(project.daily.date, { month: 'short', day: 'numeric' }) : project.daily.prompt}
            </span>
          </div>
        )}
        <div className="spacer" />
        <TimerControl timer={timer} timerEvent={timerEvent} send={send} />
        <ul className="avatars" aria-label="People in this project">
          {users.map((u) => (
            <li
              key={u.cid}
              style={{ '--c': u.color }}
              className={u.guest ? 'is-guest' : undefined}
              title={`${u.name}${u.guest ? ' (guest)' : ''}${u.cid === me.cid ? ' — you' : ''}`}
            >
              {u.name.slice(0, 1).toUpperCase()}
            </li>
          ))}
        </ul>
        <button className="btn export-button" onClick={() => setExporting(true)} title="Export the animation as a GIF">
          <Icon name="download" size={15} />
          <span>GIF</span>
        </button>
        <button className="btn btn-primary invite-button" onClick={copyInvite} title="Copy a link anyone can use to join">
          <Icon name="link" size={15} />
          <span>{copied ? 'Link copied!' : 'Invite'}</span>
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
            <ColorPicker
              value={color}
              active={!SWATCHES.includes(color)}
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
        loop={loop}
        onLoop={setLoop}
      />

      {exporting && <ExportGif frames={frames} fps={fps} loop={loop} title={project.title} onClose={() => setExporting(false)} />}
    </div>
  )
}
