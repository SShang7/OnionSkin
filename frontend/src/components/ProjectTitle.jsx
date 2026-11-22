import { useState } from 'react'

/** Project name in the board header. The owner can click it to rename. */
export default function ProjectTitle({ title, editable, onRename }) {
  const [draft, setDraft] = useState(null)

  if (!editable) return <h1 className="project-title">{title}</h1>

  if (draft === null) {
    return (
      <button className="project-title is-editable" onClick={() => setDraft(title)} title="Rename project">
        {title}
      </button>
    )
  }

  function commit() {
    const next = draft.trim().replace(/\s+/g, ' ')
    setDraft(null)
    if (next && next !== title) onRename(next)
  }

  return (
    <input
      className="project-title-input"
      autoFocus
      maxLength={60}
      value={draft}
      aria-label="Project name"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
