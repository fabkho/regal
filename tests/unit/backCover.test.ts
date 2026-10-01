import { describe, expect, it } from 'vitest'
import { barcodeDigits, ean5Modules, fitTextBlocks, formatIsbn13, splitLede, wrapWith } from '../../app/utils/covers/bookFaces'
import type { FitBlock, FitOptions } from '../../app/utils/covers/bookFaces'

/** A monospace stand-in for canvas: every glyph is half the font size wide. */
const measure: FitOptions['measure'] = (text, size) => text.length * size * 0.5

const BLURB = [
  'Mycroft Canner is a convict.',
  'For his crimes he is required, as is the custom of the 25th century, to wander the world being as useful as he can to all he meets.',
  'Carlyle Foster is a sensayer, a spiritual counselor in a world that has outlawed the public practice of religion, but which also knows that the inner lives of humans cannot be wished away.',
].join(' ')

const fit = (blocks: FitBlock[], options: Partial<FitOptions> = {}) => fitTextBlocks(blocks, {
  measure,
  maxWidth: 240,
  maxHeight: 300,
  min: 6,
  max: 24,
  ...options,
})

describe('formatIsbn13', () => {
  it('groups the digits the way a back cover prints them', () => {
    expect(formatIsbn13('9781466858756')).toBe('978-1-4668-5875-6')
    expect(formatIsbn13('9780756413026')).toBe('978-0-7564-1302-6')
  })

  it('ignores the hyphens and Goodreads wrapping it is given', () => {
    expect(formatIsbn13('978-1-4668-5875-6')).toBe('978-1-4668-5875-6')
    expect(formatIsbn13('="9781466858756"')).toBe('978-1-4668-5875-6')
  })

  it('has nothing to print without 13 digits', () => {
    expect(formatIsbn13('0756413028')).toBeNull()
    expect(formatIsbn13('')).toBeNull()
    expect(formatIsbn13(null)).toBeNull()
    expect(formatIsbn13(undefined)).toBeNull()
  })

  it('prints the 13 digits under the bars in EAN groups', () => {
    expect(barcodeDigits('9781466858756')).toBe('9 781466 858756')
    expect(barcodeDigits('nope')).toBeNull()
  })
})

describe('ean5Modules', () => {
  it('encodes the "90000" add-on: guard, five digits, four separators', () => {
    const modules = ean5Modules('90000')!
    expect(modules).toHaveLength(5 + 5 * 7 + 4 * 2)
    expect(modules.startsWith('01011')).toBe(true)
    // The parity set is picked by the checksum: 3·9 = 27 → 7 → LGLGL.
    expect(modules.slice(5, 12)).toBe('0001011') // 9 in the L set
    expect(modules.slice(14, 21)).toBe('0100111') // 0 in the G set
  })

  it('only takes five digits', () => {
    expect(ean5Modules('9000')).toBeNull()
    expect(ean5Modules('900000')).toBeNull()
    expect(ean5Modules('')).toBeNull()
  })
})

describe('wrapWith', () => {
  it('wraps greedily to the measure and keeps paragraph breaks', () => {
    const lines = wrapWith('one two three\n\nfour', 10, 0, 50, measure)
    expect(lines).toEqual(['one two', 'three', '', 'four'])
  })

  it('never drops a word that is wider than the measure', () => {
    expect(wrapWith('supercalifragilistic', 10, 0, 20, measure)).toEqual(['supercalifragilistic'])
  })
})

describe('fitTextBlocks', () => {
  it('grows the text until it fills its area', () => {
    const fitted = fit([{ text: BLURB }])
    expect(fitted.overflow).toBe(false)
    expect(fitted.height).toBeLessThanOrEqual(300)
    expect(fitted.fill).toBeGreaterThan(0.85)
    expect(fitted.fill).toBeLessThanOrEqual(1)
    expect(fitted.size).toBeGreaterThan(6)
    expect(fitted.size).toBeLessThan(24)
  })

  it('stops at max for a short text instead of ballooning it', () => {
    const fitted = fit([{ text: 'A short line.' }])
    expect(fitted.size).toBe(24)
    expect(fitted.overflow).toBe(false)
  })

  it('gives more room a bigger size, and fills either one', () => {
    const small = fit([{ text: BLURB }], { maxHeight: 200 })
    const large = fit([{ text: BLURB }], { maxHeight: 400 })
    expect(large.size).toBeGreaterThan(small.size)
    expect(small.height).toBeLessThanOrEqual(200)
    expect(large.height).toBeLessThanOrEqual(400)
    expect(small.fill).toBeGreaterThan(0.85)
    expect(large.fill).toBeGreaterThan(0.85)
  })

  it('wraps narrower text into more lines at the same measure', () => {
    const wide = fit([{ text: BLURB }], { maxWidth: 400 })
    const narrow = fit([{ text: BLURB }], { maxWidth: 160 })
    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length)
    expect(narrow.size).toBeLessThan(wide.size)
  })

  it('reports an overflow and cuts to the space when even min is too big', () => {
    const fitted = fit([{ text: BLURB.repeat(4) }], { maxHeight: 60, min: 10, max: 20 })
    expect(fitted.overflow).toBe(true)
    expect(fitted.size).toBe(10)
    expect(fitted.height).toBeLessThanOrEqual(60)
    expect(fitted.lines.length).toBeGreaterThan(0)
    for (const line of fitted.lines) expect(line.y + line.size * 1.38).toBeLessThanOrEqual(60)
  })

  it('scales a lede block and keeps the gap after it', () => {
    const blocks: FitBlock[] = [{ text: 'A tagline that opens the back.', scale: 1.5, gapAfter: 1 }, { text: BLURB }]
    const fitted = fit(blocks)
    const lede = fitted.lines.filter(line => line.block === 0)
    const body = fitted.lines.filter(line => line.block === 1)
    expect(lede.length).toBeGreaterThan(0)
    expect(body.length).toBeGreaterThan(0)
    expect(lede[0]!.size).toBeCloseTo(fitted.size * 1.5, 6)
    expect(body[0]!.size).toBeCloseTo(fitted.size, 6)
    // The first body line sits a blank base size below the last lede line.
    const lastLede = lede.at(-1)!
    expect(body[0]!.y).toBeCloseTo(lastLede.y + lastLede.size * 1.38 + fitted.size, 6)
  })

  it('honours a custom line height and empty blocks', () => {
    const tight = fit([{ text: '' }, { text: BLURB }], { lineHeight: 1 })
    expect(tight.lines.every(line => line.block === 1)).toBe(true)
    expect(tight.height).toBeLessThanOrEqual(300)
  })

  it('measures through the callback only (no canvas needed)', () => {
    const seen: number[] = []
    fit([{ text: BLURB }], { measure: (text, size) => {
      seen.push(size)
      return text.length * size * 0.5
    } })
    expect(seen.length).toBeGreaterThan(0)
    expect(new Set(seen).size).toBeGreaterThan(1) // it really searched
  })
})

describe('splitLede', () => {
  it('sets the opening sentence apart from the rest', () => {
    const [lede, body] = splitLede(BLURB)
    expect(lede).toBe('Mycroft Canner is a convict.')
    expect(body.startsWith('For his crimes')).toBe(true)
  })

  it('keeps a one-sentence blurb whole', () => {
    const [lede, body] = splitLede('A single sentence about a book.')
    expect(lede).toBe('')
    expect(body).toBe('A single sentence about a book.')
  })

  it('leaves a very long opening alone rather than cutting it', () => {
    const long = `${'word '.repeat(60)}end. And then more.`
    expect(splitLede(long)[0]).toBe('')
  })
})
