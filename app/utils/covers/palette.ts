// Colour helpers for generating Spines from Covers. Pure (works on raw RGBA
// pixel arrays), so it's unit-testable without a DOM.

export type RGB = [number, number, number]

export const INK: RGB = [0x2C, 0x2C, 0x2A]
export const PAPER: RGB = [0xF5, 0xF2, 0xEB]

export const toHex = ([r, g, b]: RGB) =>
  `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`

export function fromHex(hex: string): RGB {
  const value = hex.replace('#', '')
  return [0, 2, 4].map(i => Number.parseInt(value.slice(i, i + 2), 16)) as RGB
}

/** WCAG relative luminance, 0–1. */
export function luminance([r, g, b]: RGB): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

function saturation([r, g, b]: RGB): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

export interface Swatch {
  color: RGB
  /** Share of sampled pixels in this bucket, 0–1. */
  weight: number
}

/**
 * Coarse palette of a region: pixels are bucketed (4 bits per channel) and
 * each bucket is represented by the mean colour of its pixels. Sorted by
 * weight, heaviest first.
 */
export function palette(pixels: ArrayLike<number>, width: number, region: { x0: number, x1: number, y0?: number, y1?: number }, height: number): Swatch[] {
  const buckets = new Map<number, { r: number, g: number, b: number, n: number }>()
  const y0 = region.y0 ?? 0
  const y1 = region.y1 ?? height
  let total = 0
  for (let y = y0; y < y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      const i = (y * width + x) * 4
      if ((pixels[i + 3] ?? 255) < 128) continue
      const r = pixels[i]!
      const g = pixels[i + 1]!
      const b = pixels[i + 2]!
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n++
      buckets.set(key, bucket)
      total++
    }
  }
  return [...buckets.values()]
    .map(({ r, g, b, n }) => ({ color: [r / n, g / n, b / n] as RGB, weight: n / Math.max(1, total) }))
    .sort((a, b) => b.weight - a.weight)
}

export interface SpinePalette {
  background: RGB
  text: RGB
  /** Secondary colour for bands/ornaments. */
  accent: RGB
}

/**
 * Picks Spine colours from a Cover. The background comes from the Cover's
 * left edge (where a real spine joins the front cover); text is the palette
 * colour with the best contrast against it, or ink/paper when nothing on the
 * Cover contrasts enough.
 */
export function spinePalette(pixels: ArrayLike<number>, width: number, height: number): SpinePalette {
  const edge = palette(pixels, width, { x0: 0, x1: Math.max(1, Math.round(width * 0.1)) }, height)
  const whole = palette(pixels, width, { x0: 0, x1: width }, height)
  const background = edge[0]?.color ?? whole[0]?.color ?? [0x6B, 0x5A, 0x45]

  // Text: a reasonably common, well-contrasting Cover colour; prefer colourful ones.
  const candidates = whole
    .filter(swatch => swatch.weight > 0.01)
    .map(swatch => ({ ...swatch, contrast: contrast(swatch.color, background) }))
    .filter(swatch => swatch.contrast >= 4.5)
    .sort((a, b) => (b.contrast + saturation(b.color) * 3 + b.weight * 10) - (a.contrast + saturation(a.color) * 3 + a.weight * 10))
  const text = candidates[0]?.color
    ?? (contrast(PAPER, background) >= contrast(INK, background) ? PAPER : INK)

  const accent = whole
    .filter(swatch => swatch.weight > 0.02 && contrast(swatch.color, background) >= 1.8)
    .sort((a, b) => saturation(b.color) - saturation(a.color))[0]?.color ?? text

  return { background, text, accent }
}

/** Text colour for a plain background (no Cover): ink or paper, whichever reads better. */
export function readableOn(background: RGB): RGB {
  return contrast(PAPER, background) >= contrast(INK, background) ? PAPER : INK
}
