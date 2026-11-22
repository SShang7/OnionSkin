import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './api.js'
import { attachRooms, saveAllRooms } from './rooms.js'
import { startPromptScheduler } from './promptgen.js'

const PORT = Number(process.env.PORT) || 3001
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist')
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

/** Serves the built frontend in production (npm run build && npm start). */
function serveStatic(req, res) {
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
}

const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return
  serveStatic(req, res)
})

attachRooms(server)
startPromptScheduler()

// Write any unsaved drawing to disk before exiting.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    saveAllRooms()
    process.exit(0)
  })
}

server.listen(PORT, () => console.log(`OnionSkin server listening on http://localhost:${PORT}`))
