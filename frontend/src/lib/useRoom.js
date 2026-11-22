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
 * Connects to a room and keeps a local copy of the shared animation.
 * The doc lives in a ref (it changes on every pointer move); `version`
 * increments at most once per animation frame to re-render React.
 */
export function useRoom(room, name) {
  // A stable, mutable store: strokes change on every pointer move, so React
  // only re-renders via `version`, not by copying the document.
  const [store] = useState(() => ({ doc: { frames: [] } }))
  const wsRef = useRef(null)
  const listenersRef = useRef(new Set())
  const [version, bump] = useReducer((v) => v + 1, 0)
  const [status, setStatus] = useState('connecting')
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [presence, setPresence] = useState({}) // userId -> { frameId, cursor }

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
    let retryTimer
    let attempts = 0

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      wsRef.current = ws
      setStatus('connecting')

      ws.onopen = () => {
        attempts = 0
        ws.send(JSON.stringify({ type: 'join', room, name, clientId: getClientId() }))
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'init':
            store.doc = msg.doc
            setMe(msg.me)
            setUsers(msg.users)
            setPresence(Object.fromEntries(msg.users.map((u) => [u.id, { frameId: u.frameId, cursor: null }])))
            setStatus('connected')
            break
          case 'resync':
            store.doc = msg.doc
            break
          case 'user_joined':
            setUsers((list) => [...list.filter((u) => u.id !== msg.user.id), msg.user])
            break
          case 'user_left':
            setUsers((list) => list.filter((u) => u.id !== msg.id))
            setPresence((p) => {
              const next = { ...p }
              delete next[msg.id]
              return next
            })
            break
          case 'presence':
            setPresence((p) => ({ ...p, [msg.id]: { frameId: msg.frameId, cursor: msg.cursor } }))
            break
          case 'error':
            console.error('Server error:', msg.message)
            break
          default:
            if (STROKE_OPS.has(msg.type) || FRAME_OPS.has(msg.type)) {
              // Listeners see the document as it was just before this op.
              for (const fn of listenersRef.current) fn(msg, store.doc)
              applyOp(store.doc, msg)
            }
        }
        changed()
      }

      ws.onclose = () => {
        if (disposed) return
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
  }, [room, name, changed, store])

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  /** Stroke edits: apply locally right away, then tell the server. */
  const strokeOp = useCallback(
    (op) => {
      if (applyOp(store.doc, op)) {
        send(op)
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

  return { doc: store.doc, store, version, status, me, users, presence, strokeOp, frameOp, send, onOp, changed }
}
