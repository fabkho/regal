import { describe, expect, it } from 'vitest'
import { ean13Modules, isValidEan13 } from '../../app/utils/covers/ean13'
import { contrast, INK, PAPER, readableOn, spinePalette } from '../../app/utils/covers/palette'
import type { RGB } from '../../app/utils/covers/palette'

/** RGBA pixels for a width×height image where each column's colour comes from `columnColor`. */
function image(width: number, height: number, columnColor: (x: number) => RGB) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = columnColor(x)
      pixels.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return pixels
}

describe('spinePalette', () => {
  it('takes the Spine colour from the Cover\'s left edge', () => {
    const navy: RGB = [20, 30, 80]
    const cream: RGB = [240, 230, 200]
    const pixels = image(40, 60, x => (x < 4 ? navy : cream))
    const { background } = spinePalette(pixels, 40, 60)
    expect(background.map(Math.round)).toEqual(navy)
  })

  it('picks a text colour that contrasts with the Spine colour', () => {
    const pixels = image(40, 60, x => (x < 4 ? [20, 30, 80] : [240, 230, 200]))
    const { background, text } = spinePalette(pixels, 40, 60)
    expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5)
  })

  it('falls back to ink or paper when nothing on the Cover contrasts', () => {
    const pixels = image(40, 60, () => [120, 120, 120])
    const { text } = spinePalette(pixels, 40, 60)
    expect([INK, PAPER]).toContainEqual(text)
  })

  it('reads ink on light and paper on dark backgrounds', () => {
    expect(readableOn([250, 250, 240])).toEqual(INK)
    expect(readableOn([10, 10, 30])).toEqual(PAPER)
  })
})

describe('ean13', () => {
  it('validates check digits', () => {
    expect(isValidEan13('9780756413026')).toBe(true)
    expect(isValidEan13('9780756413027')).toBe(false)
  })

  it('encodes 95 modules with guard bars', () => {
    const modules = ean13Modules('="9780756413026"')!
    expect(modules).toHaveLength(95)
    expect(modules.slice(0, 3)).toBe('101')
    expect(modules.slice(45, 50)).toBe('01010')
    expect(modules.slice(-3)).toBe('101')
  })

  it('encodes a known ISBN correctly', () => {
    // 9780547928227: first digit 9 → parity LGGLGL for digits 2–7.
    const modules = ean13Modules('9780547928227')!
    expect(modules.slice(3, 10)).toBe('0111011') // 7, L-code
    expect(modules.slice(10, 17)).toBe('0001001') // 8, G-code
  })

  it('refuses invalid input', () => {
    expect(ean13Modules(null)).toBeNull()
    expect(ean13Modules('12345')).toBeNull()
  })
})
