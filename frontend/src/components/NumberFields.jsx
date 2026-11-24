import { useState } from 'react'

const parse = (text, max) => {
  if (!/^\s*\d{1,3}\s*$/.test(text)) return null
  const n = Number(text)
  return n <= max ? n : null
}

/** A row of number fields (RGB or HSV). Arrow keys step by 1 (Shift for 10). */
export default function NumberFields({ fields, values, onChange }) {
  const [drafts, setDrafts] = useState({})

  return (
    <div className="number-fields">
      {fields.map(({ key, label, max, wrap, title }) => {
        const draft = drafts[key]
        const invalid = draft != null && parse(draft, max) === null
        const setDraft = (d) => setDrafts((all) => ({ ...all, [key]: d }))
        const shown = wrap ? Math.round(values[key]) % max : Math.round(values[key])
        return (
          <label key={key} className="number-field" title={title}>
            <span aria-hidden="true">{label}</span>
            <input
              className={`mono ${invalid ? 'is-invalid' : ''}`}
              value={draft ?? shown}
              inputMode="numeric"
              maxLength={3}
              aria-label={title}
              onChange={(e) => {
                setDraft(e.target.value)
                const n = parse(e.target.value, max)
                if (n !== null) onChange({ ...values, [key]: n })
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => setDraft(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
                  const n = wrap ? (shown + step + max) % max : Math.max(0, Math.min(max, shown + step))
                  setDraft(null)
                  onChange({ ...values, [key]: n })
                } else if (e.key === 'Enter') {
                  setDraft(null)
                  e.currentTarget.blur()
                }
              }}
            />
          </label>
        )
      })}
    </div>
  )
}
