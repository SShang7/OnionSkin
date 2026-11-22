import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { applyOp, STROKE_OPS, FRAME_OPS, CANVAS_W, CANVAS_H } from '../shared/ops.js'
import { projects } from './db.js'
import { userFromRequest } from './auth.js'
import { dailyInfo } from './daily.js'

const SAVE_DELAY_MS = 2000 // save at most every 2 s while people are drawing
const UNLOAD_AFTER_MS = 5 * 60 * 1000 // drop empty rooms from memory after 5 min
const MAX_THUMBNAIL_CHARS = 150_000
const USER_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5f3dc4']

/** Live projects currently loaded in memory, by project id. */
const rooms = new Map()

function loadRoom(id) {
  let room = rooms.get(id)
  if (room) {
    clearTimeout(room.unloadTimer)
    return room
  }
  const doc = projects.loadDoc(id)
  if (!doc) return null
  room = { id, doc, clients: new Map(), colorIndex: 0, dirty: false, saveTimer: null, unloadTimer: null }
  rooms.set(id, room)
  return room
}

function save(room) {
  clearTimeout(room.saveTimer)
  room.saveTimer = null
  if (!room.dirty) return
  try {
    projects.saveDoc(room.id, room.doc)
    room.dirty = false
    broadcast(room, { type: 'saved', at: Date.now() })
  } catch (err) {
    console.error(`Failed to save project ${room.id}:`, err)
    room.saveTimer = setTimeout(() => save(room), SAVE_DELAY_MS * 5)
  }
}

function markDirty(room) {
  room.dirty = true
  room.saveTimer ??= setTimeout(() => save(room), SAVE_DELAY_MS)
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function broadcast(room, msg, except) {
  const data = JSON.stringify(msg)
  for (const ws of room.clients.keys()) {
    if (ws !== except && ws.readyState === ws.OPEN) ws.send(data)
  }
}

// --- hooks for the HTTP API ---

export function notifyRenamed(id, title) {
  const room = rooms.get(id)
  if (room) broadcast(room, { type: 'title', title })
}

/** The project was deleted: disconnect everyone and forget it without saving. */
export function closeRoom(id) {
  const room = rooms.get(id)
  if (!room) return
  clearTimeout(room.saveTimer)
  clearTimeout(room.unloadTimer)
  rooms.delete(id)
  for (const ws of room.clients.keys()) {
    send(ws, { type: 'deleted' })
    ws.close(4004, 'Project deleted')
  }
}

export function saveAllRooms() {
  for (const room of rooms.values()) save(room)
}

// --- validation ---

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64

function validPoints(points) {
  return Array.isArray(points) && points.length % 2 === 0 && points.length <= 2000 && points.every(isNum)
}

/** Rejects malformed ops before they touch the shared document. */
function sanitizeOp(msg, me) {
  switch (msg.type) {
    case 'stroke_start': {
      const s = msg.stroke
      if (!isId(msg.frameId) || !s || !isId(s.id) || !validPoints(s.points) || s.points.length < 2) return null
      return {
        type: msg.type,
        frameId: msg.frameId,
        stroke: {
          id: s.id,
          by: me.id,
          tool: s.tool === 'eraser' ? 'eraser' : 'pen',
          color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#000000',
          size: isNum(s.size) ? Math.min(200, Math.max(1, s.size)) : 4,
          opacity: isNum(s.opacity) ? Math.min(1, Math.max(0.05, s.opacity)) : 1,
          points: s.points,
        },
      }
    }
    case 'stroke_points':
      if (!isId(msg.frameId) || !isId(msg.strokeId) || !validPoints(msg.points)) return null
      return { type: msg.type, frameId: msg.frameId, strokeId: msg.strokeId, points: msg.points }
    case 'stroke_remove':
    case 'frame_delete':
    case 'frame_clear':
      if (!isId(msg.frameId)) return null
      return { type: msg.type, frameId: msg.frameId, strokeId: isId(msg.strokeId) ? msg.strokeId : undefined }
    case 'frame_add':
      if (!isId(msg.frameId)) return null
      return {
        type: msg.type,
        frameId: msg.frameId,
        index: isNum(msg.index) ? Math.floor(msg.index) : undefined,
        copyFrom: isId(msg.copyFrom) ? msg.copyFrom : undefined,
        by: me.id,
      }
    case 'frame_move':
      if (!isId(msg.frameId) || !isNum(msg.index)) return null
      return { type: msg.type, frameId: msg.frameId, index: Math.floor(msg.index) }
    default:
      return null
  }
}

// --- WebSocket server ---

export function attachRooms(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 })

  wss.on('connection', (ws, req) => {
    const account = userFromRequest(req)
    let room = null
    let me = null
    ws.isAlive = true
    ws.on('pong', () => (ws.isAlive = true))

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }

      if (msg.type === 'join') {
        if (room) return
        const projectId = cleanText(msg.projectId, 32).toUpperCase()
        const project = projectId && projects.get(projectId)
        room = project && loadRoom(projectId)
        if (!room) {
          send(ws, { type: 'error', code: 'not_found', message: 'This project doesn’t exist or was deleted.' })
          ws.close(4004, 'Not found')
          return
        }
        if (!account && !cleanText(msg.name, 24)) {
          send(ws, { type: 'error', code: 'name_required', message: 'Pick a name to join as a guest.' })
          ws.close(4001, 'Name required')
          room = null
          return
        }
        if (account && account.id !== project.owner_id) projects.recordVisit(projectId, account.id)

        me = {
          cid: randomUUID(), // this connection (one per tab) — used for presence
          // Signed-in people keep the same id everywhere, so undo works across tabs.
          id: account?.id ?? (isId(msg.clientId) ? `guest:${msg.clientId}` : `guest:${randomUUID()}`),
          name: account?.username ?? cleanText(msg.name, 24),
          guest: !account,
          color: USER_COLORS[room.colorIndex++ % USER_COLORS.length],
          frameId: null,
        }
        room.clients.set(ws, me)
        send(ws, {
          type: 'init',
          me,
          project: { id: project.id, title: project.title, ownerName: project.owner_name, isOwner: account?.id === project.owner_id, daily: dailyInfo(project) },
          doc: room.doc,
          users: [...room.clients.values()],
          canvas: { width: CANVAS_W, height: CANVAS_H },
        })
        broadcast(room, { type: 'user_joined', user: me }, ws)
        return
      }

      if (!room) return

      if (msg.type === 'presence') {
        me.frameId = isId(msg.frameId) ? msg.frameId : null
        const cursor = isNum(msg.x) && isNum(msg.y) ? { x: msg.x, y: msg.y } : null
        broadcast(room, { type: 'presence', cid: me.cid, frameId: me.frameId, cursor }, ws)
        return
      }

      if (msg.type === 'thumbnail') {
        const url = msg.dataUrl
        if (typeof url === 'string' && url.startsWith('data:image/jpeg;base64,') && url.length <= MAX_THUMBNAIL_CHARS) {
          projects.saveThumbnail(room.id, url)
        }
        return
      }

      const op = sanitizeOp(msg, me)
      if (!op || !applyOp(room.doc, op)) {
        // Let the sender roll back an optimistic stroke that the server could not apply.
        if (op?.type === 'stroke_start') send(ws, { type: 'resync', doc: room.doc })
        return
      }
      markDirty(room)
      if (STROKE_OPS.has(op.type)) broadcast(room, op, ws)
      else if (FRAME_OPS.has(op.type)) broadcast(room, op)
    })

    ws.on('close', () => {
      if (!room || !rooms.has(room.id)) return
      room.clients.delete(ws)
      broadcast(room, { type: 'user_left', cid: me.cid })
      if (room.clients.size === 0) {
        save(room)
        const r = room
        r.unloadTimer = setTimeout(() => {
          if (r.clients.size === 0) {
            save(r)
            rooms.delete(r.id)
          }
        }, UNLOAD_AFTER_MS)
      }
    })
  })

  // Drop connections that stopped answering pings (closed laptop lids, etc.).
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30000).unref()

  return wss
}
