import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importLibrary } from '../../shared/library/importLibrary'
import type { Book } from '../../shared/types/book'
import { BOOKCASE_SPACING, bookDimensions, HEADROOM, layoutLibrary, MAX_THICKNESS, sortForShelves } from '../../app/utils/bookcase/layout'
import { SHELF_SLOTS } from '../../app/utils/bookcase/shelves'

const demo = importLibrary(readFileSync(new URL('../fixtures/demo-library.csv', import.meta.url), 'utf8')).books

function makeBook(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    title: `Book ${id}`,
    seriesTitle: null,
    author: 'Someone',
    additionalAuthors: [],
    isbn10: null,
    isbn13: null,
    pages: 320,
    binding: 'Paperback',
    yearPublished: null,
    originalYear: null,
    rating: 0,
    status: 'read',
    tags: [],
    dateRead: null,
    dateAdded: null,
    review: null,
    reviewHasSpoiler: false,
    readCount: 0,
    ...overrides,
  }
}

const manyBooks = (count: number) => Array.from({ length: count }, (_, i) => makeBook(String(i + 1)))

describe('layoutLibrary', () => {
  it('places every Book exactly once', () => {
    const { placements } = layoutLibrary(demo)
    expect(placements).toHaveLength(demo.length)
    expect(new Set(placements.map(p => p.bookId)).size).toBe(demo.length)
  })

  it('is deterministic', () => {
    expect(layoutLibrary(demo)).toEqual(layoutLibrary([...demo].reverse()))
  })

  it('keeps Books inside their Shelf: width, clearance, depth', () => {
    for (const p of layoutLibrary(manyBooks(500)).placements) {
      const slot = SHELF_SLOTS[p.slot]!
      // x within its own Bookcase
      const x = p.x - p.bookcase * BOOKCASE_SPACING
      expect(x - p.thickness / 2).toBeGreaterThanOrEqual(slot.xStart - 1e-9)
      expect(x + p.thickness / 2).toBeLessThanOrEqual(slot.xEnd + 1e-9)
      expect(p.y - p.height / 2).toBeCloseTo(slot.y)
      expect(p.height).toBeLessThanOrEqual(slot.clearance - HEADROOM + 1e-9)
      expect(p.z + p.depth / 2).toBeLessThanOrEqual(slot.zFront)
      expect(p.z - p.depth / 2).toBeGreaterThanOrEqual(slot.zBack)
    }
  })

  it('never overlaps Books on the same Shelf', () => {
    const { placements } = layoutLibrary(manyBooks(500))
    const bySlot = new Map<string, typeof placements>()
    for (const p of placements) {
      const key = `${p.bookcase}:${p.slot}`
      bySlot.set(key, [...(bySlot.get(key) ?? []), p])
    }
    for (const group of bySlot.values()) {
      const sorted = [...group].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        const cur = sorted[i]!
        expect(cur.x - cur.thickness / 2).toBeGreaterThanOrEqual(prev.x + prev.thickness / 2)
      }
    }
  })

  it('adds another Bookcase when the Library overflows', () => {
    expect(layoutLibrary(manyBooks(40)).bookcaseCount).toBe(1)
    const big = layoutLibrary(manyBooks(800))
    expect(big.bookcaseCount).toBeGreaterThan(1)
    const second = big.placements.find(p => p.bookcase === 1)!
    expect(second.x).toBeGreaterThan(BOOKCASE_SPACING / 2)
  })

  it('centres small Libraries vertically instead of using the top Shelf', () => {
    const { placements } = layoutLibrary(manyBooks(20))
    const shelves = new Set(placements.map(p => SHELF_SLOTS[p.slot]!.shelf))
    expect(shelves.has(0)).toBe(false)
  })

  it('orders Sections: currently reading, read, to-read, then custom', () => {
    const books = [
      makeBook('a', { status: 'wishlist' }),
      makeBook('b', { status: 'to-read' }),
      makeBook('c', { status: 'read' }),
      makeBook('d', { status: 'currently-reading' }),
    ]
    expect(sortForShelves(books).map(b => b.status)).toEqual(['currently-reading', 'read', 'to-read', 'wishlist'])
    const ordered = layoutLibrary(books).placements.sort((a, b) => a.slot - b.slot || a.x - b.x)
    expect(ordered.map(p => p.section)).toEqual(['currently-reading', 'read', 'to-read', 'wishlist'])
  })

  it('sorts within a Section by date read, newest first', () => {
    const books = [
      makeBook('old', { dateRead: '2019-01-01' }),
      makeBook('new', { dateRead: '2024-05-01' }),
      makeBook('none'),
    ]
    expect(sortForShelves(books).map(b => b.id)).toEqual(['new', 'old', 'none'])
  })
})

describe('bookDimensions', () => {
  it('grows thicker with more pages', () => {
    const thin = bookDimensions(makeBook('x', { pages: 120 }), 0.3, 0.14)
    const thick = bookDimensions(makeBook('x', { pages: 1100 }), 0.3, 0.14)
    expect(thick.thickness).toBeGreaterThan(thin.thickness)
  })

  it('caps box sets and omnibus editions at a believable thickness', () => {
    const boxSet = bookDimensions(makeBook('x', { pages: 3800 }), 0.3, 0.14)
    expect(boxSet.thickness).toBe(MAX_THICKNESS)
  })

  it('uses a default page count when pages are unknown', () => {
    const unknown = bookDimensions(makeBook('x', { pages: null }), 0.3, 0.14)
    const defaulted = bookDimensions(makeBook('x', { pages: 300 }), 0.3, 0.14)
    expect(unknown).toEqual(defaulted)
  })

  it('makes hardcovers taller than paperbacks and caps height at the clearance', () => {
    const hard = bookDimensions(makeBook('x', { binding: 'Hardcover' }), 1, 0.14)
    const paper = bookDimensions(makeBook('x', { binding: 'Paperback' }), 1, 0.14)
    expect(hard.height).toBeGreaterThan(paper.height)
    expect(bookDimensions(makeBook('x', { binding: 'Hardcover' }), 0.2, 0.14).height).toBeCloseTo(0.2 - HEADROOM)
  })
})
