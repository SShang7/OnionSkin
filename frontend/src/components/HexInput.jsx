import { useState } from 'react'
import { parseHex } from '../lib/color.js'

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
