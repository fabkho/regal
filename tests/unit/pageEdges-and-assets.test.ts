import { describe, expect, it } from 'vitest'
import { pageEdgePlan, paperStock, seeded } from '../../app/utils/books/pageEdges'
import { assetEntryFor, assetUrl } from '../../app/utils/covers/bookAssets'

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

describe('assetEntryFor', () => {
  const manifest = {
    9780756413026: { spine: '9780756413026/spine.webp', source: 'ai' as const },
    300009: { back: 'custom/back.webp', source: 'photo' as const },
  }

  it('finds a Book by ISBN-13 first, then by Goodreads Book Id', () => {
    expect(assetEntryFor({ id: 'x', isbn13: '978-0756413026' }, manifest)?.source).toBe('ai')
    expect(assetEntryFor({ id: '300009', isbn13: null }, manifest)?.source).toBe('photo')
    expect(assetEntryFor({ id: 'nope', isbn13: '9780000000002' }, manifest)).toBeNull()
  })

  it('resolves relative paths under /book-assets/ and keeps absolute ones', () => {
    expect(assetUrl('a/front.webp')).toBe('/book-assets/a/front.webp')
    expect(assetUrl('/api/cover?isbn=1')).toBe('/api/cover?isbn=1')
    expect(assetUrl('https://example.com/x.jpg')).toBe('https://example.com/x.jpg')
  })
})
