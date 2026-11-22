import { useState } from 'react'

/** Accepts "#rgb", "rgb", "#rrggbb" or "rrggbb" and returns "#rrggbb", or null if invalid. */
function parseHex(text) {
  const m = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(m)) return `#${m}`
  if (/^[0-9a-f]{3}$/.test(m)) return `#${[...m].map((c) => c + c).join('')}`
  return null
}

/**
 * Text field for a hex colour. While typing it shows your draft; a valid
 * 6-digit value applies right away, and leaving the field snaps back to the
 * current colour (which also expands a valid 3-digit value).
 */
export default function HexInput({ value, onChange }) {
  const [draft, setDraft] = useState(null)
  const invalid = draft !== null && parseHex(draft) === null

  function commit() {
    const hex = draft !== null ? parseHex(draft) : null
    if (hex) onChange(hex)
    setDraft(null)
  }

  return (
    <input
      className={`hex-input mono ${invalid ? 'is-invalid' : ''}`}
      value={draft ?? value.replace('#', '').toUpperCase()}
      maxLength={7}
      spellCheck={false}
      aria-label="Hex colour"
      title="Hex colour"
      onChange={(e) => {
        setDraft(e.target.value)
        const v = e.target.value.trim().replace(/^#/, '')
        if (v.length === 6 && parseHex(v)) onChange(parseHex(v))
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
