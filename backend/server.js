import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { applyOp, createFrame, STROKE_OPS, FRAME_OPS, CANVAS_W, CANVAS_H } from '../shared/ops.js'

const PORT = Number(process.env.PORT) || 3001
const ROOM_TTL_MS = 30 * 60 * 1000 // keep empty rooms around for 30 minutes
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist')
const USER_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5f3dc4']

/** @type {Map<string, { code: string, doc: any, clients: Map<import('ws').WebSocket, any>, expiry?: NodeJS.Timeout, colorIndex: number }>} */
const rooms = new Map()

function getRoom(code) {
  let room = rooms.get(code)
  if (!room) {
    room = { code, doc: { frames: [createFrame(randomUUID())] }, clients: new Map(), colorIndex: 0 }
    rooms.set(code, room)
    console.log(`room ${code} created`)
  }
  clearTimeout(room.expiry)
  return room
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

// --- HTTP: serves the built frontend in production (npm run build && npm start) ---
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' }

const server = http.createServer((req, res) => {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('OnionSkin server is running. In development, open the Vite URL (http://localhost:5173).')
    return
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, urlPath)
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html')
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

// --- WebSocket: one connection per participant ---
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 })

wss.on('connection', (ws) => {
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
      const code = cleanText(msg.room, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '')
      if (!code) return send(ws, { type: 'error', message: 'Invalid room code' })
      room = getRoom(code)
      me = {
        id: isId(msg.clientId) ? msg.clientId : randomUUID(),
        name: cleanText(msg.name, 24) || 'Anonymous',
        color: USER_COLORS[room.colorIndex++ % USER_COLORS.length],
        frameId: null,
      }
      room.clients.set(ws, me)
      send(ws, {
        type: 'init',
        me,
        room: room.code,
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
      broadcast(room, { type: 'presence', id: me.id, frameId: me.frameId, cursor }, ws)
      return
    }

    const op = sanitizeOp(msg, me)
    if (!op || !applyOp(room.doc, op)) {
      // Let the sender roll back an optimistic stroke that the server could not apply.
      if (op?.type === 'stroke_start') send(ws, { type: 'resync', doc: room.doc })
      return
    }
    if (STROKE_OPS.has(op.type)) broadcast(room, op, ws)
    else if (FRAME_OPS.has(op.type)) broadcast(room, op)
  })

  ws.on('close', () => {
    if (!room) return
    room.clients.delete(ws)
    broadcast(room, { type: 'user_left', id: me.id })
    if (room.clients.size === 0) {
      const r = room
      r.expiry = setTimeout(() => {
        if (r.clients.size === 0) {
          rooms.delete(r.code)
          console.log(`room ${r.code} expired`)
        }
      }, ROOM_TTL_MS)
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
}, 30000)

server.listen(PORT, () => console.log(`OnionSkin server listening on http://localhost:${PORT}`))
