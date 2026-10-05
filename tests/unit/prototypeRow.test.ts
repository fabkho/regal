// Design round (horizontal Stack): the prototype rows' pure layouts.
import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { inRowOrder, layoutFan, layoutPiles, layoutShelf } from '../../app/prototype/row/layout'
import { rowBooks } from '../../app/prototype/row/data'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

// Newest first, as rowBooks returns them: 9 in March, 1 in February, 2 in January.
const books = [
  ...Array.from({ length: 9 }, (_, index) => book(`m${index}`, { dateRead: `2026-03-${String(20 - index).padStart(2, '0')}` })),
  book('f', { dateRead: '2026-02-10' }),
  book('j1', { dateRead: '2026-01-20' }),
  book('j2', { dateRead: '2026-01-05' }),
]

describe('prototype rows', () => {
  it('stands the Books left to right in order, a card before each month', () => {
    const { poses, markers, extent } = layoutShelf(books)
    expect(poses.map(pose => pose.bookId)).toEqual(books.map(item => item.id))
    for (let index = 1; index < poses.length; index++) expect(poses[index]!.x).toBeGreaterThan(poses[index - 1]!.x)
    expect(markers.map(marker => marker.label)).toEqual(['MAR 2026', 'FEB 2026', 'JAN 2026'])
    expect(markers.every(marker => marker.height! > 0.15)).toBe(true)
    expect(extent[0]).toBeLessThan(poses[0]!.x)
    expect(extent[1]).toBeGreaterThan(poses.at(-1)!.x)
  })

  it('piles each month, at most 7 Books a pile, newest on top', () => {
    const { poses, piles } = layoutPiles(books)
    const march = poses.filter(pose => pose.bookId.startsWith('m'))
    const marchPiles = new Set(march.map(pose => piles![pose.bookId]))
    expect(marchPiles.size).toBe(2)
    const first = poses.filter(pose => piles![pose.bookId] === piles!.m0)
    expect(first).toHaveLength(7)
    expect(Math.max(...first.map(pose => pose.y))).toBe(poses.find(pose => pose.bookId === 'm0')!.y)
  })

  it('fans the Books at a steady pitch with a step at each month', () => {
    const { poses } = layoutFan(books)
    const step = (a: string, b: string) => poses.find(pose => pose.bookId === b)!.x - poses.find(pose => pose.bookId === a)!.x
    expect(step('m0', 'm1')).toBeCloseTo(step('m1', 'm2'))
    expect(step('m8', 'f')).toBeGreaterThan(step('m0', 'm1'))
  })

  it('reads oldest first for a year from January', () => {
    expect(inRowOrder(books, 'chrono')[0]!.id).toBe('j2')
  })

  it('repeats the read Books, moved back in time, to reach a count', () => {
    const { books: shown, assets } = rowBooks(books, { m0: { front: 'a.webp' } }, { count: 30 })
    expect(shown).toHaveLength(30)
    expect(new Set(shown.map(item => item.id)).size).toBe(30)
    expect(shown.find(item => item.id === 'm0~1')!.dateRead).toBe('2025-03-20')
    expect(assets['m0~1']).toEqual({ front: 'a.webp' })
  })
})
