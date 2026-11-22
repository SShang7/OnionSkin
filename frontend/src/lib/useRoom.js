import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { applyOp, STROKE_OPS, FRAME_OPS } from '../../../shared/ops.js'

export function uid() {
  return crypto.randomUUID()
}

/** A stable id per browser tab so a reconnect keeps "my strokes" for undo. */
function getClientId() {
  try {
    let id = sessionStorage.getItem('onionskin.clientId')
    if (!id) {
      id = uid()
      sessionStorage.setItem('onionskin.clientId', id)
    }
    return id
  } catch {
    return uid()
  }
}

/**
 * Connects to a project and keeps a local copy of the shared animation.
 * The doc lives in a stable store (it changes on every pointer move);
 * `version` increments at most once per animation frame to re-render React.
 * `guestName` is only used when not signed in.
 */
export function useRoom(projectId, guestName) {
  // A stable, mutable store: strokes change on every pointer move, so React
  // only re-renders via `version`, not by copying the document.
  const [store] = useState(() => ({ doc: { frames: [] } }))
  const wsRef = useRef(null)
  const listenersRef = useRef(new Set())
  const [version, bump] = useReducer((v) => v + 1, 0)
  const [status, setStatus] = useState('connecting')
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [presence, setPresence] = useState({}) // connection id -> { frameId, cursor }
  const [project, setProject] = useState(null)
  const [fatal, setFatal] = useState(null) // { code, message } — stop reconnecting
  const [savedAt, setSavedAt] = useState(null)
  const [unsaved, setUnsaved] = useState(false)

  const scheduled = useRef(false)
  const changed = useCallback(() => {
    if (scheduled.current) return
    scheduled.current = true
    requestAnimationFrame(() => {
      scheduled.current = false
      bump()
    })
  }, [])

  useEffect(() => {
    let disposed = false
    let gaveUp = false // the server said this project can't be joined
    let retryTimer
    let attempts = 0

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      wsRef.current = ws
      setStatus('connecting')

      ws.onopen = () => {
        attempts = 0
        ws.send(JSON.stringify({ type: 'join', projectId, name: guestName, clientId: getClientId() }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'init':
            store.doc = msg.doc
            setMe(msg.me)
            setProject(msg.project)
            setUsers(msg.users)
            setPresence(Object.fromEntries(msg.users.map((u) => [u.cid, { frameId: u.frameId, cursor: null }])))
            setStatus('connected')
            break
          case 'resync':
            store.doc = msg.doc
            break
          case 'user_joined':
            setUsers((list) => [...list.filter((u) => u.cid !== msg.user.cid), msg.user])
            break
          case 'user_left':
            setUsers((list) => list.filter((u) => u.cid !== msg.cid))
            setPresence((p) => {
              const next = { ...p }
              delete next[msg.cid]
              return next
            })
            break
          case 'presence':
            setPresence((p) => ({ ...p, [msg.cid]: { frameId: msg.frameId, cursor: msg.cursor } }))
            break
          case 'saved':
            setSavedAt(msg.at)
            setUnsaved(false)
            break
          case 'title':
            setProject((p) => p && { ...p, title: msg.title })
            break
          case 'deleted':
            gaveUp = true
            setFatal({ code: 'deleted', message: 'The owner deleted this project.' })
            break
          case 'error':
            if (msg.code) {
              gaveUp = true
              setFatal({ code: msg.code, message: msg.message })
            } else console.error('Server error:', msg.message)
            break
          default:
            if (STROKE_OPS.has(msg.type) || FRAME_OPS.has(msg.type)) {
              // Listeners see the document as it was just before this op.
              for (const fn of listenersRef.current) fn(msg, store.doc)
              applyOp(store.doc, msg)
              setUnsaved(true)
            }
        }
        changed()
      }

      ws.onclose = () => {
        if (disposed || gaveUp) return
        setStatus('disconnected')
        const delay = Math.min(5000, 500 * 2 ** attempts++)
        retryTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      wsRef.current?.close()
    }
  }, [projectId, guestName, changed, store])

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  /** Stroke edits: apply locally right away, then tell the server. */
  const strokeOp = useCallback(
    (op) => {
      if (applyOp(store.doc, op)) {
        send(op)
        setUnsaved(true)
        changed()
      }
    },
    [send, changed, store],
  )

  /** Frame edits: the server applies them and echoes back to everyone. */
  const frameOp = useCallback((op) => send(op), [send])

  /** Subscribe to remote/echoed ops (e.g. to select a frame I just added). */
  const onOp = useCallback((fn) => {
    listenersRef.current.add(fn)
    return () => listenersRef.current.delete(fn)
  }, [])

  return {
    doc: store.doc,
    version,
    status,
    me,
    users,
    presence,
    project,
    setProject,
    fatal,
    savedAt,
    unsaved,
    strokeOp,
    frameOp,
    send,
    onOp,
    changed,
  }
}
