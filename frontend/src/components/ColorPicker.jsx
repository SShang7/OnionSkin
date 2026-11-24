import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hexToHsv, hexToRgb, hsvToHex, rgbToHex } from '../lib/color.js'
import HexInput from './HexInput.jsx'
import NumberFields from './NumberFields.jsx'

const HSV_FIELDS = [
  { key: 'h', label: 'H', max: 360, wrap: true, title: 'Hue (0–360)' },
  { key: 's', label: 'S', max: 100, title: 'Saturation (0–100)' },
  { key: 'v', label: 'V', max: 100, title: 'Value / brightness (0–100)' },
]

const RGB_FIELDS = [
  { key: 'r', label: 'R', max: 255, title: 'Red (0–255)' },
  { key: 'g', label: 'G', max: 255, title: 'Green (0–255)' },
  { key: 'b', label: 'B', max: 255, title: 'Blue (0–255)' },
]

const POP_WIDTH = 220
const GAP = 8
const EDGE = 12

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/**
 * The rainbow swatch. Opens a picker with a saturation/brightness square,
 * a hue slider, and RGB, HSV and hex fields.
 */
export default function ColorPicker({ value, active, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  // Hex can't hold a hue when the colour is grey or black, so remember the HSV
  // we last produced: dragging to grey and back keeps your hue.
  const [kept, setKept] = useState(null)
  const hsv = kept?.hex === value ? kept.hsv : hexToHsv(value)
  const buttonRef = useRef(null)
  const popRef = useRef(null)
  const areaRef = useRef(null)

  const setHsv = (next) => {
    const hex = hsvToHex(next)
    setKept({ hex, hsv: next })
    onChange(hex)
  }

  // The toolbar scrolls, so place the popover on the page next to the swatch.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const b = buttonRef.current.getBoundingClientRect()
      // Clear the whole toolbar, not just the swatch.
      const edge = buttonRef.current.closest('.toolbar')?.getBoundingClientRect().right ?? b.right
      const height = popRef.current?.offsetHeight ?? 320
      const vw = window.innerWidth
      const vh = window.innerHeight
      // To the right of the toolbar on wide screens, below it on narrow ones.
      const beside = edge + GAP + POP_WIDTH + EDGE <= vw && vw > 720
      const left = beside ? edge + GAP : clamp(b.left + b.width / 2 - POP_WIDTH / 2, EDGE, vw - POP_WIDTH - EDGE)
      const top = beside ? clamp(b.top - 40, EDGE, vh - height - EDGE) : b.bottom + GAP
      setPos({ left, top })
    }
    place()
    // Follow the swatch if the window resizes or the toolbar scrolls.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!popRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pickFromArea(e) {
    const r = areaRef.current.getBoundingClientRect()
    const s = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100)
    const v = clamp(100 - ((e.clientY - r.top) / r.height) * 100, 0, 100)
    setHsv({ ...hsv, s, v })
  }

  function areaKey(e) {
    const step = e.shiftKey ? 10 : 1
    const moves = { ArrowLeft: ['s', -step], ArrowRight: ['s', step], ArrowDown: ['v', -step], ArrowUp: ['v', step] }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    const [key, delta] = move
    setHsv({ ...hsv, [key]: clamp(Math.round(hsv[key]) + delta, 0, 100) })
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 100, v: 100 })

  return (
    <>
      <button
        ref={buttonRef}
        className={`swatch swatch-custom ${active ? 'is-on' : ''}`}
        style={{ background: active ? value : undefined }}
        onClick={() => setOpen((v) => !v)}
        title="Custom colour"
        aria-label="Custom colour"
        aria-expanded={open}
        aria-haspopup="dialog"
      />
      {open && (
        <div
          ref={popRef}
          className="color-pop"
          role="dialog"
          aria-label="Custom colour"
          style={{ width: POP_WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
        >
          <div
            ref={areaRef}
            className="sv-area"
            style={{ '--hue': hueColor }}
            tabIndex={0}
            role="slider"
            aria-label="Saturation and brightness"
            aria-valuetext={`Saturation ${Math.round(hsv.s)}, brightness ${Math.round(hsv.v)}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              pickFromArea(e)
            }}
            onPointerMove={(e) => e.buttons & 1 && pickFromArea(e)}
            onKeyDown={areaKey}
          >
            <span className="sv-handle" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: value }} />
          </div>
          <input
            className="hue-slider"
            type="range"
            min="0"
            max="359"
            value={Math.round(hsv.h) % 360}
            onChange={(e) => setHsv({ ...hsv, h: Number(e.target.value) })}
            aria-label="Hue"
          />
          <NumberFields fields={RGB_FIELDS} values={hexToRgb(value)} onChange={(rgb) => onChange(rgbToHex(rgb))} />
          <NumberFields fields={HSV_FIELDS} values={hsv} onChange={setHsv} />
          <div className="color-fields">
            <span className="color-preview" style={{ background: value }} />
            <label className="hex-field" title="Hex colour">
              <span aria-hidden="true">#</span>
              <HexInput value={value} onChange={onChange} />
            </label>
          </div>
        </div>
      )}
    </>
  )
}
