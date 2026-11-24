import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { renderThumbnail } from './render.js'

const SAMPLE_PIXELS = 400_000 // pixels used to pick the colour palette

const nextTick = () => new Promise((resolve) => setTimeout(resolve))

/**
 * Encodes frames as an animated GIF on a white background.
 * One palette is shared by every frame, so colours don't flicker between frames.
 * Runs on the main thread but yields between frames so the page stays responsive.
 *
 * @returns {Promise<Blob>}
 */
export async function encodeGif(frames, { layerIds, width, height, fps, loop = true, onProgress, signal }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const pixels = width * height
  const total = frames.length * 2 // two passes: palette, then encoding

  const render = (frame) => {
    renderThumbnail(canvas, frame, layerIds)
    return ctx.getImageData(0, 0, width, height).data
  }

  const check = () => {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
  }

  // Pass 1: sample pixels from every frame to build one shared palette.
  const step = Math.max(1, Math.ceil((pixels * frames.length) / SAMPLE_PIXELS))
  const perFrame = Math.ceil(pixels / step)
  const sample = new Uint8ClampedArray(perFrame * frames.length * 4)
  let n = 0
  for (const [i, frame] of frames.entries()) {
    check()
    const data = render(frame)
    // Start each frame at a different offset so thin lines aren't skipped every time.
    for (let p = i % step; p < pixels; p += step) {
      sample.set(data.subarray(p * 4, p * 4 + 4), n)
      n += 4
    }
    onProgress?.((i + 1) / total)
    await nextTick()
  }
  const palette = quantize(sample.slice(0, n), 256)

  // Pass 2: map each frame to the palette and encode it.
  const gif = GIFEncoder()
  const delay = Math.round(1000 / fps)
  for (const [i, frame] of frames.entries()) {
    check()
    const index = applyPalette(render(frame), palette)
    gif.writeFrame(index, width, height, {
      delay,
      // The palette and loop setting are written once, with the first frame.
      ...(i === 0 ? { palette, repeat: loop ? 0 : -1 } : {}),
    })
    onProgress?.((frames.length + i + 1) / total)
    await nextTick()
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}

/** Saves a blob through a temporary download link. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
