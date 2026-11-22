import { memo, useEffect, useRef, useState } from 'react'
import { renderThumbnail } from '../lib/render.js'
import Icon from './Icon.jsx'

const Thumb = memo(function Thumb({ frame, rev }) {
  const ref = useRef(null)
  useEffect(() => {
    renderThumbnail(ref.current, frame)
  }, [frame, rev])
  return <canvas ref={ref} width={224} height={126} className="thumb-canvas" />
})

export default function Timeline({
  frames,
  currentIndex,
  playing,
  playIndex,
  fps,
  usersByFrame,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onTogglePlay,
  onFps,
}) {
  const [dragOver, setDragOver] = useState(null)
  const activeRef = useRef(null)
  const shownIndex = playing ? playIndex : currentIndex

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [shownIndex])

  return (
    <footer className="timeline">
      <div className="timeline-controls">
        <button className="btn btn-icon btn-primary" onClick={onTogglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <label className="fps" title="Playback speed">
          <input type="range" min="1" max="24" value={fps} onChange={(e) => onFps(Number(e.target.value))} />
          <span className="mono">{fps} fps</span>
        </label>
        <span className="frame-count mono">
          {shownIndex + 1} / {frames.length}
        </span>
        <div className="spacer" />
        <button className="btn" onClick={onAdd} title="New blank frame (N)">
          <Icon name="plus" size={16} /> Frame
        </button>
        <button className="btn" onClick={onDuplicate} title="Duplicate frame (D)">
          <Icon name="copy" size={16} /> Duplicate
        </button>
        <button className="btn btn-danger" onClick={onDelete} disabled={frames.length <= 1} title="Delete frame">
          <Icon name="trash" size={16} />
        </button>
      </div>

      <ol className="frames">
        {frames.map((frame, i) => (
          <li
            key={frame.id}
            ref={i === shownIndex ? activeRef : null}
            className={[
              'frame',
              i === shownIndex && 'is-active',
              dragOver === i && 'is-drop-target',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable={!playing}
            onDragStart={(e) => e.dataTransfer.setData('text/x-frame', frame.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(i)
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const id = e.dataTransfer.getData('text/x-frame')
              if (id && id !== frame.id) onMove(id, i)
            }}
          >
            <button className="frame-button" onClick={() => onSelect(i)} aria-label={`Frame ${i + 1}`}>
              <Thumb frame={frame} rev={frame.rev} />
              <span className="frame-number mono">{i + 1}</span>
              <span className="frame-users">
                {(usersByFrame[frame.id] ?? []).map((u) => (
                  <span key={u.cid} className="dot" style={{ background: u.color }} title={u.name} />
                ))}
              </span>
            </button>
          </li>
        ))}
        <li className="frame frame-add">
          <button className="frame-button" onClick={onAdd} aria-label="Add frame">
            <Icon name="plus" size={22} />
          </button>
        </li>
      </ol>
    </footer>
  )
}
