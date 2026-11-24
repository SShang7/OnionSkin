import { useEffect, useRef, useState } from 'react'
import { encodeGif, downloadBlob } from '../lib/gif.js'
import Icon from './Icon.jsx'

const SIZES = [
  { id: 'small', label: 'Small', width: 480, height: 270 },
  { id: 'medium', label: 'Medium', width: 640, height: 360 },
  { id: 'large', label: 'Large', width: 1280, height: 720 },
]

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** A file name from the project title, safe on every OS. */
function fileName(title) {
  const base = title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${base || 'animation'}.gif`
}

/** Dialog that exports the project's frames as an animated GIF and downloads it. */
export default function ExportGif({ frames, fps: initialFps, loop: initialLoop = true, title, onClose }) {
  const [size, setSize] = useState('medium')
  const [fps, setFps] = useState(initialFps)
  const [loop, setLoop] = useState(initialLoop)
  const [progress, setProgress] = useState(null) // 0–1 while exporting
  const [result, setResult] = useState(null) // { blob, name }
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const exportRef = useRef(null)

  const exporting = progress !== null
  const seconds = frames.length / fps

  useEffect(() => {
    exportRef.current?.focus()
    return () => abortRef.current?.abort()
  }, [])

  function close() {
    abortRef.current?.abort()
    onClose()
  }

  // While the dialog is open, keys go to it and not to the editor's shortcuts
  // (Space, N, arrows…), even when focus has fallen back to the page.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    const onKey = (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  async function start() {
    const { width, height } = SIZES.find((s) => s.id === size)
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setResult(null)
    setProgress(0)
    try {
      // Copy the frame list so edits made by others during export don't shift it.
      const snapshot = frames.map((f) => ({ ...f, strokes: [...f.strokes] }))
      const blob = await encodeGif(snapshot, { width, height, fps, loop, signal: controller.signal, onProgress: setProgress })
      const name = fileName(title)
      downloadBlob(blob, name)
      setResult({ blob, name })
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Export failed')
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && !exporting && close()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="modal-head">
          <h2 id="export-title">Export GIF</h2>
          <button className="btn btn-icon btn-ghost" onClick={close} aria-label="Close">
            <Icon name="clear" size={16} />
          </button>
        </div>

        <fieldset className="export-sizes" disabled={exporting}>
          <legend>Size</legend>
          {SIZES.map((s) => (
            <label key={s.id} className={`export-size ${size === s.id ? 'is-on' : ''}`}>
              <input type="radio" name="gif-size" value={s.id} checked={size === s.id} onChange={() => setSize(s.id)} />
              <span className="export-size-name">{s.label}</span>
              <span className="export-size-dims mono">
                {s.width}×{s.height}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="export-speed">
          <span>Speed</span>
          <input type="range" min="1" max="24" value={fps} disabled={exporting} onChange={(e) => setFps(Number(e.target.value))} />
          <span className="mono">{fps} fps</span>
        </label>

        <label className="export-option">
          <input type="checkbox" checked={loop} disabled={exporting} onChange={(e) => setLoop(e.target.checked)} />
          <span>Loop forever</span>
        </label>

        <p className="export-summary">
          {frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} seconds
          {size === 'large' && frames.length > 60 ? ' · large GIFs with many frames take a while' : ''}
        </p>

        {exporting && (
          <div className="export-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {result && !exporting && (
          <p className="export-done">
            <Icon name="check" size={15} /> Downloaded {result.name} ({formatBytes(result.blob.size)}).{' '}
            <button className="link-button" onClick={() => downloadBlob(result.blob, result.name)}>
              Download again
            </button>
          </p>
        )}
        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn" onClick={close}>
            {exporting ? 'Cancel' : result ? 'Done' : 'Cancel'}
          </button>
          <button ref={exportRef} className="btn btn-primary" onClick={start} disabled={exporting}>
            <Icon name="download" size={16} />
            {exporting ? `Exporting… ${Math.round(progress * 100)}%` : result ? 'Export again' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
