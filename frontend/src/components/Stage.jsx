import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CANVAS_W, CANVAS_H, getLayer, ONION_PREV, ONION_NEXT } from '../lib/render.js'
import { uid } from '../lib/useRoom.js'

const round = (n) => Math.round(n * 10) / 10
const CURSOR_INTERVAL_MS = 40

export default function Stage({ frame, prevFrame, nextFrame, onion, version, tool, color, size, opacity, disabled, me, strokeOp, sendPresence, cursors }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const drawingRef = useRef(null)
  const lastCursorRef = useRef(0)
  const [box, setBox] = useState({ w: 0, h: 0 })

  // Fit a 16:9 sheet of paper inside the available space.
  useLayoutEffect(() => {
    const el = wrapRef.current
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const w = Math.max(0, Math.min(width, (height * CANVAS_W) / CANVAS_H))
      setBox({ w: Math.floor(w), h: Math.floor((w * CANVAS_H) / CANVAS_W) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Paint: white paper, onion-skin ghosts of neighbouring frames, then the current frame.
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    if (!frame) return
    if (onion && prevFrame) {
      ctx.globalAlpha = 0.3
      ctx.drawImage(getLayer(prevFrame, ONION_PREV), 0, 0)
    }
    if (onion && nextFrame) {
      ctx.globalAlpha = 0.2
      ctx.drawImage(getLayer(nextFrame, ONION_NEXT), 0, 0)
    }
    ctx.globalAlpha = 1
    ctx.drawImage(getLayer(frame), 0, 0)
  }, [frame, prevFrame, nextFrame, onion, version])

  function toPoint(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [round(((e.clientX - r.left) / r.width) * CANVAS_W), round(((e.clientY - r.top) / r.height) * CANVAS_H)]
  }

  function flush() {
    const d = drawingRef.current
    d.raf = 0
    if (d.pending.length === 0) return
    strokeOp({ type: 'stroke_points', frameId: d.frameId, strokeId: d.strokeId, points: d.pending })
    d.pending = []
  }

  function onPointerDown(e) {
    if (disabled || !frame || !me) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const [x, y] = toPoint(e)
    const strokeId = uid()
    strokeOp({
      type: 'stroke_start',
      frameId: frame.id,
      stroke: { id: strokeId, by: me.id, tool, color, size: tool === 'eraser' ? size * 3 : size, opacity, points: [x, y] },
    })
    drawingRef.current = { frameId: frame.id, strokeId, pending: [], lastX: x, lastY: y, raf: 0 }
  }

  function onPointerMove(e) {
    const [x, y] = toPoint(e)
    const now = performance.now()
    if (now - lastCursorRef.current > CURSOR_INTERVAL_MS) {
      lastCursorRef.current = now
      sendPresence({ x, y })
    }

    const d = drawingRef.current
    if (!d) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [px, py] = toPoint(ev)
      if (Math.hypot(px - d.lastX, py - d.lastY) < 1.5) continue
      d.pending.push(px, py)
      d.lastX = px
      d.lastY = py
    }
    // Batch points and send them once per animation frame.
    if (d.pending.length && !d.raf) d.raf = requestAnimationFrame(flush)
  }

  function endStroke() {
    const d = drawingRef.current
    if (!d) return
    cancelAnimationFrame(d.raf)
    flush()
    drawingRef.current = null
  }

  return (
    <div className="stage" ref={wrapRef}>
      <div className="paper" style={{ width: box.w, height: box.h }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={disabled ? 'canvas is-disabled' : `canvas tool-${tool}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => sendPresence(null)}
        />
        {cursors.map(({ user, cursor }) => (
          <div
            key={user.id}
            className="remote-cursor"
            style={{ left: `${(cursor.x / CANVAS_W) * 100}%`, top: `${(cursor.y / CANVAS_H) * 100}%`, '--c': user.color }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M1 1l5 14 2-6 6-2z" fill="var(--c)" stroke="#fff" strokeWidth="1.2" />
            </svg>
            <span>{user.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
