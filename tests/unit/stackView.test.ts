import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { applyStackView, DEFAULT_STACK_VIEW, readYears } from '../../app/utils/stack/view'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

const books = [
  book('a', { title: 'Alpha', author: 'Zoe Zed', rating: 4, dateRead: '2025-12-28' }),
  book('b', { title: 'Beta', author: 'Amy Ash', rating: 5, dateRead: '2026-03-14' }),
  book('c', { title: 'Gamma', author: 'Max Mid', rating: 4.25, dateRead: '2026-09-24' }),
  book('d', { title: 'Delta', author: 'Bo Bee', rating: 0, dateRead: '2026-05-01' }),
]
const ids = (list: Book[]) => list.map(item => item.id)

describe('applyStackView', () => {
  it('puts the newest read on top by default', () => {
    expect(ids(applyStackView(books, DEFAULT_STACK_VIEW))).toEqual(['c', 'd', 'b', 'a'])
  })

  it('sorts by rating, author surname or title', () => {
    expect(ids(applyStackView(books, { ...DEFAULT_STACK_VIEW, sort: 'rating' }))).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(applyStackView(books, { ...DEFAULT_STACK_VIEW, sort: 'author' }))).toEqual(['b', 'd', 'c', 'a'])
    expect(ids(applyStackView(books, { ...DEFAULT_STACK_VIEW, sort: 'title' }))).toEqual(['a', 'b', 'd', 'c'])
  })

  it('filters by year read and minimum rating', () => {
    expect(ids(applyStackView(books, { ...DEFAULT_STACK_VIEW, year: 2026 }))).toEqual(['c', 'd', 'b'])
    expect(ids(applyStackView(books, { ...DEFAULT_STACK_VIEW, minRating: 4.25 }))).toEqual(['c', 'b'])
  })

  it('lists read years newest first', () => {
    expect(readYears(books)).toEqual([2026, 2025])
  })
})
