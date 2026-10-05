import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { layoutRow, ROW_SHEET, rowBooks, rowLabels } from '../../app/utils/row/layout'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

const library = [
  book('m1', { dateRead: '2026-03-20' }),
  book('m2', { dateRead: '2026-03-02' }),
  book('f1', { dateRead: '2026-02-10' }),
  book('d1', { dateRead: '2025-12-24' }),
  book('now', { status: 'currently-reading' }),
  book('later', { status: 'to-read' }),
  book('undated', { dateRead: null }),
]

describe('rowBooks', () => {
  it('shows what is being read and what was read, newest first', () => {
    expect(rowBooks(library).map(item => item.id)).toEqual(['now', 'm1', 'm2', 'f1', 'd1'])
  })

  it('cuts to the newest `limit`', () => {
    expect(rowBooks(library, { limit: 2 }).map(item => item.id)).toEqual(['now', 'm1'])
  })

  it('keeps one year\'s reads only', () => {
    expect(rowBooks(library, { year: 2026 }).map(item => item.id)).toEqual(['m1', 'm2', 'f1'])
  })
})

describe('layoutRow', () => {
  const oldestFirst = rowBooks(library).reverse()
  const { poses, markers, extent } = layoutRow(oldestFirst)

  it('stands the Books left to right, oldest first, on one line', () => {
    expect(poses.map(pose => pose.bookId)).toEqual(['d1', 'f1', 'm2', 'm1', 'now'])
    expect(poses.every(pose => Math.abs(pose.y - pose.height / 2) < 1e-9)).toBe(true)
    expect(extent[0]).toBeLessThan(poses[0]!.x)
    expect(extent[1]).toBeGreaterThan(poses.at(-1)!.x)
  })

  it('presses the Books together, a hairline sheet before each month', () => {
    expect(markers.map(marker => marker.label)).toEqual(['DEC 2025', 'FEB 2026', 'MAR 2026', 'READING'])
    const left = (index: number) => poses[index]!.x - poses[index]!.thickness / 2
    const right = (index: number) => poses[index]!.x + poses[index]!.thickness / 2
    // m2 and m1 share March: no gap.
    expect(left(3)).toBeCloseTo(right(2))
    // A new month: one sheet between.
    expect(left(1) - right(0)).toBeCloseTo(ROW_SHEET)
    expect(markers.every(marker => marker.height >= 0.15)).toBe(true)
  })

  it('is deterministic', () => {
    expect(layoutRow(oldestFirst)).toEqual(layoutRow(oldestFirst))
  })
})

describe('rowLabels', () => {
  const markers = [
    { key: 'a', label: 'JAN 2026', count: 1, x: 0, height: 0.2 },
    { key: 'b', label: 'FEB 2026', count: 2, x: 0.01, height: 0.2 },
    { key: 'c', label: 'MAR 2025', count: 3, x: 0.5, height: 0.2 },
  ]

  it('sets the month with its year small, and leaves out a date that would run into the one before', () => {
    expect(rowLabels(markers, 800).map(label => [label.key, label.text, label.small])).toEqual([['a', 'JAN', '2026'], ['c', 'MAR', '2025']])
  })

  it('drops the year when the whole row is one year', () => {
    expect(rowLabels(markers.slice(0, 1), 800)[0]!.small).toBe('')
  })
})
