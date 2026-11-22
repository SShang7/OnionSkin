// Operations on the shared animation document.
// Used by both the server (authoritative copy) and the client (local copy),
// so every participant applies edits the same way.
//
// doc = { frames: [{ id, rev, strokes: [{ id, by, tool, color, size, points: [x, y, x, y, ...] }] }] }

export const CANVAS_W = 1280
export const CANVAS_H = 720
export const MAX_FRAMES = 300
export const MAX_POINTS_PER_STROKE = 20000

export function createFrame(id) {
  return { id, rev: 0, strokes: [] }
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
      const frame = findFrame(doc, op.frameId)
      if (!frame || frame.strokes.length === 0) return false
      frame.strokes = []
      frame.rev++
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
