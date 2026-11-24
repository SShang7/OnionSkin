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

let layerScratch = null

/**
 * Renders a frame onto a transparent canvas, one layer at a time from the bottom
 * up, so an eraser only erases its own layer. `layerIds` lists the layers to
 * draw, in order (hidden layers left out). Optionally tints everything one colour.
 */
export function renderFrame(canvas, frame, layerIds, tint) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (layerIds.length === 1) {
    for (const s of frame.strokes) if (s.layer === layerIds[0]) drawStroke(ctx, s)
  } else {
    layerScratch ??= makeCanvas()
    const lctx = layerScratch.getContext('2d')
    for (const id of layerIds) {
      const strokes = frame.strokes.filter((s) => s.layer === id)
      if (strokes.length === 0) continue
      lctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      for (const s of strokes) drawStroke(lctx, s)
      ctx.drawImage(layerScratch, 0, 0)
    }
  }
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
// re-rendered when they (or the visible layers) actually change.
const imageCache = new Map() // key -> { rev, layersKey, canvas }
const MAX_CACHED_IMAGES = 6

export function getFrameImage(frame, layerIds, tint = null) {
  const key = `${frame.id}|${tint ?? ''}`
  const layersKey = layerIds.join(',')
  let entry = imageCache.get(key)
  if (entry && entry.rev === frame.rev && entry.layersKey === layersKey) {
    imageCache.delete(key)
    imageCache.set(key, entry) // mark as recently used
    return entry.canvas
  }
  if (!entry) {
    if (imageCache.size >= MAX_CACHED_IMAGES) imageCache.delete(imageCache.keys().next().value)
    entry = { rev: -1, layersKey: null, canvas: makeCanvas() }
  }
  renderFrame(entry.canvas, frame, layerIds, tint)
  entry.rev = frame.rev
  entry.layersKey = layersKey
  imageCache.set(key, entry)
  return entry.canvas
}

let scratch = null
/** Draws a frame scaled onto a canvas of any size, on a white background. */
export function renderThumbnail(canvas, frame, layerIds) {
  scratch ??= makeCanvas()
  renderFrame(scratch, frame, layerIds)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height)
}

export const ONION_PREV = '#e03131'
export const ONION_NEXT = '#1971c2'
