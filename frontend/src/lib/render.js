import { CANVAS_W, CANVAS_H } from '../../../shared/ops.js'

export { CANVAS_W, CANVAS_H }

/** Draws a stroke with points [x, y, x, y, ...] using midpoint smoothing. */
export function drawStroke(ctx, stroke) {
  const p = stroke.points
  if (p.length < 2) return
  ctx.save()
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  // Each stroke is one path, so overlapping segments don't darken each other.
  ctx.globalAlpha = stroke.opacity ?? 1
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (p.length === 2) {
    ctx.beginPath()
    ctx.arc(p[0], p[1], stroke.size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(p[0], p[1])
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2
      const my = (p[i + 1] + p[i + 3]) / 2
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my)
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1])
    ctx.stroke()
  }
  ctx.restore()
}

function makeCanvas(w = CANVAS_W, h = CANVAS_H) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Renders a frame's strokes onto a transparent canvas, optionally tinted one color. */
export function renderLayer(canvas, frame, tint) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const s of frame.strokes) drawStroke(ctx, s)
  if (tint) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }
  return canvas
}

// Small cache so the current frame and its onion-skin neighbours are only
// re-rendered when they actually change.
const layerCache = new Map() // key -> { rev, canvas }
const MAX_CACHED_LAYERS = 6

export function getLayer(frame, tint = null) {
  const key = `${frame.id}|${tint ?? ''}`
  let entry = layerCache.get(key)
  if (entry && entry.rev === frame.rev) {
    layerCache.delete(key)
    layerCache.set(key, entry) // mark as recently used
    return entry.canvas
  }
  if (!entry) {
    if (layerCache.size >= MAX_CACHED_LAYERS) {
      const oldest = layerCache.keys().next().value
      layerCache.delete(oldest)
    }
    entry = { rev: -1, canvas: makeCanvas() }
  }
  renderLayer(entry.canvas, frame, tint)
  entry.rev = frame.rev
  layerCache.set(key, entry)
  return entry.canvas
}

let scratch = null
/** Draws a small preview of a frame on a white background. */
export function renderThumbnail(canvas, frame) {
  scratch ??= makeCanvas()
  renderLayer(scratch, frame)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height)
}

export const ONION_PREV = '#e03131'
export const ONION_NEXT = '#1971c2'
