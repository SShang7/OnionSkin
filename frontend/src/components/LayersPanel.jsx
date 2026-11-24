import { memo, useEffect, useRef, useState } from 'react'
import { renderThumbnail } from '../lib/render.js'
import Icon from './Icon.jsx'

const MAX_NAME = 24

/** What this layer has on the current frame. */
const LayerThumb = memo(function LayerThumb({ frame, rev, layerId }) {
  const ref = useRef(null)
  // Debounced: while someone draws, the frame changes on every pointer move.
  useEffect(() => {
    if (!frame) return
    const t = setTimeout(() => renderThumbnail(ref.current, frame, [layerId]), 120)
    return () => clearTimeout(t)
  }, [frame, rev, layerId])
  return <canvas ref={ref} width={64} height={36} className="layer-thumb" aria-hidden="true" />
})

function LayerName({ name, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (!editing) {
    return (
      <span
        className="layer-name"
        title="Double-click to rename"
        onDoubleClick={() => {
          setDraft(name)
          setEditing(true)
        }}
      >
        {name}
      </span>
    )
  }

  const commit = () => {
    const next = draft.trim().slice(0, MAX_NAME)
    if (next && next !== name) onRename(next)
    setEditing(false)
  }
  return (
    <input
      className="layer-name-input"
      value={draft}
      maxLength={MAX_NAME}
      autoFocus
      aria-label="Layer name"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

/**
 * The project's layers, top layer first. Layers are shared with everyone and
 * span every frame. Hiding a layer only changes your own view.
 */
export default function LayersPanel({ layers, frame, activeId, hidden, maxLayers, onSelect, onToggleHidden, onAdd, onDelete, onMove, onRename }) {
  const [dragOver, setDragOver] = useState(null)
  const activeIndex = layers.findIndex((l) => l.id === activeId)
  const active = layers[activeIndex]
  const top = layers.length - 1

  return (
    <aside className="layers-panel" aria-label="Layers">
      <div className="layers-head">
        <h2>Layers</h2>
        <button className="btn btn-icon btn-ghost" onClick={onAdd} disabled={layers.length >= maxLayers} title="New layer above this one">
          <Icon name="plus" size={16} />
        </button>
      </div>

      <ol className="layers-list">
        {layers
          .map((layer, index) => ({ layer, index }))
          .reverse()
          .map(({ layer, index }) => {
            const isHidden = hidden.has(layer.id)
            return (
              <li
                key={layer.id}
                className={['layer-row', layer.id === activeId && 'is-active', isHidden && 'is-hidden', dragOver === index && 'is-drop-target']
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/x-layer', layer.id)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('text/x-layer')) return
                  e.preventDefault()
                  setDragOver(index)
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(null)
                  const id = e.dataTransfer.getData('text/x-layer')
                  if (id && id !== layer.id) onMove(id, index)
                }}
                onClick={() => onSelect(layer.id)}
              >
                <button
                  className="layer-eye"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleHidden(layer.id)
                  }}
                  title={isHidden ? 'Show layer (only for you)' : 'Hide layer (only for you)'}
                  aria-label={`${isHidden ? 'Show' : 'Hide'} ${layer.name}`}
                  aria-pressed={isHidden}
                >
                  <Icon name={isHidden ? 'eyeOff' : 'eye'} size={15} />
                </button>
                <LayerThumb frame={frame} rev={frame?.rev} layerId={layer.id} />
                <LayerName name={layer.name} onRename={(name) => onRename(layer.id, name)} />
              </li>
            )
          })}
      </ol>

      {active && hidden.has(active.id) && <p className="layers-note">This layer is hidden. Show it to draw on it.</p>}

      <div className="layers-actions">
        <button className="btn btn-icon btn-ghost" onClick={() => onMove(active.id, activeIndex + 1)} disabled={!active || activeIndex >= top} title="Move layer up">
          <Icon name="up" size={16} />
        </button>
        <button className="btn btn-icon btn-ghost" onClick={() => onMove(active.id, activeIndex - 1)} disabled={!active || activeIndex <= 0} title="Move layer down">
          <Icon name="down" size={16} />
        </button>
        <div className="spacer" />
        <button className="btn btn-icon btn-ghost btn-danger" onClick={() => onDelete(active)} disabled={!active || layers.length <= 1} title="Delete layer">
          <Icon name="trash" size={16} />
        </button>
      </div>
    </aside>
  )
}
