import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { applyStackView, DEFAULT_STACK_VIEW, groupOf, readYears, resolveGrouping, stackGroups } from '../../app/utils/stack/view'

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

describe('date separators', () => {
  const history = [
    book('reading', { status: 'currently-reading' }),
    book('sep', { dateRead: '2026-09-24' }),
    book('mar2', { dateRead: '2026-03-19' }),
    book('mar1', { dateRead: '2026-03-14' }),
    book('dec', { dateRead: '2025-12-28' }),
    book('jan', { dateRead: '2025-01-02' }),
    book('nodate', { dateRead: null }),
  ]

  it('groups by year by default, by month inside one year, never for other sorts', () => {
    expect(resolveGrouping(DEFAULT_STACK_VIEW)).toBe('year')
    expect(resolveGrouping({ ...DEFAULT_STACK_VIEW, year: 2026 })).toBe('month')
    expect(resolveGrouping({ ...DEFAULT_STACK_VIEW, group: 'month' })).toBe('month')
    expect(resolveGrouping({ ...DEFAULT_STACK_VIEW, year: 2026, group: 'year' })).toBe('year')
    expect(resolveGrouping({ ...DEFAULT_STACK_VIEW, group: 'off' })).toBe('off')
    for (const sort of ['rating', 'author', 'title'] as const) {
      expect(resolveGrouping({ ...DEFAULT_STACK_VIEW, sort, group: 'year' })).toBe('off')
    }
  })

  it('labels years, English months, the reading pile and undated reads', () => {
    expect(groupOf(history[1]!, 'year')).toEqual({ key: '2026', label: '2026' })
    expect(groupOf(history[1]!, 'month')).toEqual({ key: '2026-09', label: 'SEP 2026' })
    expect(groupOf(history[0]!, 'year')).toEqual({ key: 'status:currently-reading', label: 'READING' })
    expect(groupOf(history[6]!, 'month')).toEqual({ key: 'undated', label: 'UNDATED' })
    expect(groupOf(book('x', { status: 'to-read' }), 'year').label).toBe('TO READ')
  })

  it('splits the pile into runs, top first, undated reads last', () => {
    const sorted = applyStackView(history, DEFAULT_STACK_VIEW)
    expect(ids(sorted)).toEqual(['reading', 'sep', 'mar2', 'mar1', 'dec', 'jan', 'nodate'])
    expect(stackGroups(sorted, 'year').map(group => [group.label, group.bookIds])).toEqual([
      ['READING', ['reading']],
      ['2026', ['sep', 'mar2', 'mar1']],
      ['2025', ['dec', 'jan']],
      ['UNDATED', ['nodate']],
    ])
    expect(stackGroups(sorted, 'month').map(group => group.label)).toEqual(['READING', 'SEP 2026', 'MAR 2026', 'DEC 2025', 'JAN 2025', 'UNDATED'])
    expect(stackGroups(sorted, 'off')).toEqual([])
  })

  it('keeps keys unique when a hand-made order revisits a group', () => {
    const keys = stackGroups([history[1]!, history[4]!, history[2]!], 'year').map(group => group.key)
    expect(new Set(keys).size).toBe(3)
  })
})
