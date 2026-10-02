import { describe, expect, it } from 'vitest'
import { pageEdgePlan, paperStock, seeded } from '../../app/utils/books/pageEdges'
import { assetFaces } from '../../app/utils/covers/bookAssets'

describe('paperStock', () => {
  it('prints mass-market paperbacks on pulp and hardcovers on white stock', () => {
    expect(paperStock('Mass Market Paperback')).toBe('pulp')
    expect(paperStock('Hardcover')).toBe('white')
    expect(paperStock('Gebundene Ausgabe')).toBe('white')
    expect(paperStock('Paperback')).toBe('cream')
    expect(paperStock(null)).toBe('cream')
  })
})

describe('pageEdgePlan', () => {
  const book = { id: '300001', pages: 768, binding: 'Mass Market Paperback' }

  it('is deterministic per Book', () => {
    expect(pageEdgePlan(book, 0.056, 0.11)).toEqual(pageEdgePlan(book, 0.056, 0.11))
  })

  it('draws one line between every two leaves, inside the boards', () => {
    const plan = pageEdgePlan(book, 0.056, 0.11)
    expect(plan.sheets).toHaveLength(768 / 2 - 1)
    expect(Math.min(...plan.sheets)).toBeGreaterThan(plan.boardPx - 1)
    expect(Math.max(...plan.sheets)).toBeLessThan(plan.width - plan.boardPx + 1)
    expect(plan.signatures.size).toBeGreaterThan(0)
  })

  it('gives hardcovers thicker, inset boards than paperbacks', () => {
    const soft = pageEdgePlan(book, 0.056, 0.11)
    const hard = pageEdgePlan({ ...book, binding: 'Hardcover' }, 0.056, 0.11)
    expect(hard.boardPx).toBeGreaterThan(soft.boardPx)
    expect(hard.inset).toBe(true)
    expect(soft.inset).toBe(false)
  })

  it('keeps the canvas small for very long books', () => {
    expect(pageEdgePlan({ ...book, pages: 4000 }, 0.085, 0.12).width).toBeLessThanOrEqual(512)
    expect(pageEdgePlan({ ...book, pages: 40 }, 0.008, 0.12).width).toBeGreaterThanOrEqual(48)
  })
})

describe('seeded', () => {
  it('repeats for the same seed and stays in [0, 1)', () => {
    const a = seeded(42)
    const b = seeded(42)
    const values = Array.from({ length: 50 }, () => a())
    expect(values).toEqual(Array.from({ length: 50 }, () => b()))
    expect(values.every(value => value >= 0 && value < 1)).toBe(true)
  })
})

/** Resolves like the display: against the library file's URL. */
const at = (reference: string) => new URL(reference, 'https://books.example.com/v2/library.json').href

describe('assetFaces', () => {
  it('prefers the small pile copies and takes the colours from the file', () => {
    const faces = assetFaces({
      front: 'k/front.webp',
      spine: 'k/spine.webp',
      back: 'k/back.webp',
      pile: { front: 'k/front-pile.webp', spine: 'k/spine-pile.webp' },
      palette: { background: '#48445c', text: '#F5F2EB', accent: '#1c1926' },
      spineColor: '#151728',
    }, at)
    expect(faces.spine).toBe('https://books.example.com/v2/k/spine-pile.webp')
    expect(faces.pileFront).toBe('https://books.example.com/v2/k/front-pile.webp')
    // Taken out, a Book shows its full front; the back is only ever seen then.
    expect(faces.front).toBe('https://books.example.com/v2/k/front.webp')
    expect(faces.back).toBe('https://books.example.com/v2/k/back.webp')
    expect(faces.palette).toEqual({ background: [0x48, 0x44, 0x5C], text: [0xF5, 0xF2, 0xEB], accent: [0x1C, 0x19, 0x26] })
    expect(faces.spineColor).toEqual([0x15, 0x17, 0x28])
  })

  it('falls back to the full faces and no colours without pile copies and palette', () => {
    const faces = assetFaces({ front: 'k/front.webp', spine: 'k/spine.webp' }, at)
    expect(faces.spine).toBe('https://books.example.com/v2/k/spine.webp')
    expect(faces.pileFront).toBe('https://books.example.com/v2/k/front.webp')
    expect(faces.back).toBeUndefined()
    expect(faces.palette).toBeNull()
    expect(faces.spineColor).toBeNull()
  })

  it('ignores malformed colours', () => {
    const faces = assetFaces({ palette: { background: 'red', text: '#fff', accent: '#000000' }, spineColor: 'nope' }, at)
    expect(faces.palette).toBeNull()
    expect(faces.spineColor).toBeNull()
  })

  it('leaves out an image the resolver refuses', () => {
    const faces = assetFaces({ front: 'k/front.webp', spine: 'k/spine.webp' }, reference => (reference.includes('spine') ? null : at(reference)))
    expect(faces.front).toBe('https://books.example.com/v2/k/front.webp')
    expect(faces.spine).toBeUndefined()
  })
})
