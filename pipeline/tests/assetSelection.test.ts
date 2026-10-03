import { describe, expect, it } from 'vitest'
import type { Book } from '../src/layer'
import { parseLimit, selectBooks } from '../src/assets/select'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

const shelf = [
  book('old', { dateRead: '2023-02-21' }),
  book('undated-new', { dateAdded: '2026-01-01' }),
  book('new', { dateRead: '2026-09-24' }),
  book('undated-old', { dateAdded: '2020-01-01' }),
  book('mid', { dateRead: '2025-01-12' }),
  book('wish', { status: 'to-read', dateRead: null }),
]
const ids = (books: Book[]) => books.map(item => item.id)

describe('asset build selection', () => {
  it('parses --limit as a count or all', () => {
    expect(parseLimit('10')).toBe(10)
    expect(parseLimit('all')).toBe(Infinity)
    expect(parseLimit('0')).toBe(Infinity)
    expect(() => parseLimit('ten')).toThrow()
  })

  it('takes the latest N dated Books of the shelf', () => {
    expect(ids(selectBooks(shelf, 'read', 2))).toEqual(['new', 'mid'])
  })

  it('takes the whole shelf with all, undated Books last', () => {
    expect(ids(selectBooks(shelf, 'read', Infinity))).toEqual(['new', 'mid', 'old', 'undated-new', 'undated-old'])
  })
})
