// CSS colours as the 3D needs them: the paper veil behind a picked Book takes
// the colour of what it covers (RegalBooksRow's card surface, `--regal-surface`).

export interface ParsedColor {
  /** `#rrggbb`, sRGB. */
  hex: string
  /** 0..1 */
  alpha: number
}

const hex2 = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')

/** `rgb(…)` / `rgba(…)` as `getComputedStyle` writes them (commas or spaces, `/ alpha`, % alpha). */
export function parseRgb(value: string): ParsedColor | null {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(value.trim())
  if (!match) return null
  const alpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1)
  return { hex: `#${hex2(Number(match[1]))}${hex2(Number(match[2]))}${hex2(Number(match[3]))}`, alpha: Math.min(1, Math.max(0, alpha)) }
}

let probe: CanvasRenderingContext2D | null | undefined

/**
 * Any CSS colour the browser knows (`oklch()`, `color()`, `color-mix()` …,
 * not `var()`; `getComputedStyle` gives resolved ones): `rgb()` directly,
 * the rest drawn on a 1 px canvas. Null without a canvas.
 */
export function parseCssColor(value: string): ParsedColor | null {
  const rgb = parseRgb(value)
  if (rgb || typeof document === 'undefined') return rgb
  if (probe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!probe) return null
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = '#000'
  probe.fillStyle = value
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return { hex: `#${hex2(r ?? 0)}${hex2(g ?? 0)}${hex2(b ?? 0)}`, alpha: (a ?? 0) / 255 }
}

/**
 * The colour a surface shows: `element`'s own background, or (transparent,
 * as `unstyled` leaves it) the nearest ancestor's, up to <html>. `fallback`
 * where nothing paints one.
 */
export function backgroundOf(element: Element | null, fallback: string): string {
  if (typeof getComputedStyle === 'undefined') return fallback
  for (let current = element; current; current = current.parentElement) {
    const parsed = parseCssColor(getComputedStyle(current).backgroundColor)
    if (parsed && parsed.alpha > 0.01) return parsed.hex
  }
  return fallback
}
