// Operations on the shared animation document.
// Used by both the server (authoritative copy) and the client (local copy),
// so every participant applies edits the same way.
//
// doc = {
//   layers: [{ id, name }],  // bottom to top; every frame has the same layers
//   frames: [{ id, rev, strokes: [{ id, by, layer, tool, color, size, opacity, points: [x, y, x, y, ...] }] }],
// }

export const CANVAS_W = 1280
export const CANVAS_H = 720
export const MAX_FRAMES = 300
export const MAX_POINTS_PER_STROKE = 20000
export const MAX_LAYERS = 12
export const MAX_LAYER_NAME = 24
const FIRST_LAYER = { id: 'layer-1', name: 'Layer 1' }

export function createFrame(id) {
  return { id, rev: 0, strokes: [] }
}

/** A new document: one empty frame on one layer. */
export function createDoc(frameId) {
  return { layers: [{ ...FIRST_LAYER }], frames: [createFrame(frameId)] }
}

/** Upgrades documents saved before layers existed: everything goes on one layer. */
export function normalizeDoc(doc) {
  if (!Array.isArray(doc.layers) || doc.layers.length === 0) doc.layers = [{ ...FIRST_LAYER }]
  const ids = new Set(doc.layers.map((l) => l.id))
  for (const frame of doc.frames) {
    for (const stroke of frame.strokes) if (!ids.has(stroke.layer)) stroke.layer = doc.layers[0].id
  }
  return doc
}

function findLayerIndex(doc, id) {
  return doc.layers.findIndex((l) => l.id === id)
}

function findFrame(doc, id) {
  return doc.frames.find((f) => f.id === id)
}

/** Applies op to doc in place. Returns true if the doc changed. */
export function applyOp(doc, op) {
  switch (op.type) {
    case 'stroke_start': {
      const frame = findFrame(doc, op.frameId)
      if (!frame || frame.strokes.some((s) => s.id === op.stroke.id)) return false
      if (findLayerIndex(doc, op.stroke.layer) < 0) return false
      frame.strokes.push({ ...op.stroke, points: [...op.stroke.points] })
      frame.rev++
      return true
    }
    case 'stroke_points': {
      const frame = findFrame(doc, op.frameId)
      const stroke = frame?.strokes.find((s) => s.id === op.strokeId)
      if (!stroke || stroke.points.length + op.points.length > MAX_POINTS_PER_STROKE) return false
      for (const p of op.points) stroke.points.push(p)
      frame.rev++
      return true
    }
    case 'stroke_remove': {
      const frame = findFrame(doc, op.frameId)
      if (!frame) return false
      const i = frame.strokes.findIndex((s) => s.id === op.strokeId)
      if (i < 0) return false
      frame.strokes.splice(i, 1)
      frame.rev++
      return true
    }
    case 'frame_add': {
      if (doc.frames.length >= MAX_FRAMES || findFrame(doc, op.frameId)) return false
      const source = op.copyFrom ? findFrame(doc, op.copyFrom) : null
      const frame = createFrame(op.frameId)
      if (source) frame.strokes = source.strokes.map((s) => ({ ...s, points: [...s.points] }))
      // Clamp and record the real index so everyone inserts at the same place.
      op.index = Math.max(0, Math.min(doc.frames.length, op.index ?? doc.frames.length))
      doc.frames.splice(op.index, 0, frame)
      return true
    }
    case 'frame_delete': {
      if (doc.frames.length <= 1) return false
      const i = doc.frames.findIndex((f) => f.id === op.frameId)
      if (i < 0) return false
      doc.frames.splice(i, 1)
      return true
    }
    case 'frame_move': {
      const from = doc.frames.findIndex((f) => f.id === op.frameId)
      if (from < 0) return false
      const [frame] = doc.frames.splice(from, 1)
      op.index = Math.max(0, Math.min(doc.frames.length, op.index))
      doc.frames.splice(op.index, 0, frame)
      return true
    }
    case 'frame_clear': {
      // With a layerId, clears just that layer on the frame.
      const frame = findFrame(doc, op.frameId)
      if (!frame) return false
      const kept = op.layerId ? frame.strokes.filter((s) => s.layer !== op.layerId) : []
      if (kept.length === frame.strokes.length) return false
      frame.strokes = kept
      frame.rev++
      return true
    }
    case 'layer_add': {
      if (doc.layers.length >= MAX_LAYERS || findLayerIndex(doc, op.layerId) >= 0) return false
      op.index = Math.max(0, Math.min(doc.layers.length, op.index ?? doc.layers.length))
      doc.layers.splice(op.index, 0, { id: op.layerId, name: op.name })
      return true
    }
    case 'layer_delete': {
      const i = findLayerIndex(doc, op.layerId)
      if (i < 0 || doc.layers.length <= 1) return false
      doc.layers.splice(i, 1)
      // Its drawings go with it, on every frame.
      for (const frame of doc.frames) {
        const kept = frame.strokes.filter((s) => s.layer !== op.layerId)
        if (kept.length !== frame.strokes.length) {
          frame.strokes = kept
          frame.rev++
        }
      }
      return true
    }
    case 'layer_move': {
      const from = findLayerIndex(doc, op.layerId)
      if (from < 0) return false
      const [layer] = doc.layers.splice(from, 1)
      op.index = Math.max(0, Math.min(doc.layers.length, op.index))
      doc.layers.splice(op.index, 0, layer)
      return true
    }
    case 'layer_rename': {
      const layer = doc.layers[findLayerIndex(doc, op.layerId)]
      if (!layer || layer.name === op.name) return false
      layer.name = op.name
      return true
    }
    default:
      return false
  }
}

// Stroke edits are applied optimistically by the sender and relayed to others.
// Frame edits change ordering, so the server applies them first and echoes
// them to everyone (sender included) to keep frame order identical.
export const STROKE_OPS = new Set(['stroke_start', 'stroke_points', 'stroke_remove'])
export const FRAME_OPS = new Set(['frame_add', 'frame_delete', 'frame_move', 'frame_clear'])
// Layer edits also go through the server first, so everyone has the same layer order.
export const LAYER_OPS = new Set(['layer_add', 'layer_delete', 'layer_move', 'layer_rename'])
