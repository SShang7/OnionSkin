/** Accepts "#rgb", "rgb", "#rrggbb" or "rrggbb" and returns "#rrggbb", or null if invalid. */
export function parseHex(text) {
  const m = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(m)) return `#${m}`
  if (/^[0-9a-f]{3}$/.test(m)) return `#${[...m].map((c) => c + c).join('')}`
  return null
}

/** "#rrggbb" → { h: 0–360, s: 0–100, v: 0–100 } (unrounded) */
export function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max ? (d / max) * 100 : 0, v: max * 100 }
}

/** { h, s, v } → "#rrggbb" */
export function hsvToHex({ h, s, v }) {
  const S = s / 100
  const V = v / 100
  const f = (k) => {
    const x = (k + h / 60) % 6
    return V - V * S * Math.max(0, Math.min(x, 4 - x, 1))
  }
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`
}

/** "#rrggbb" → { r, g, b } (0–255) */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** { r, g, b } → "#rrggbb" */
export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}
