import { describe, expect, it } from 'vitest'
import { importLibrary } from '../../shared/library/importLibrary'
import { importReadingTracker, NotAReadingTrackerExportError, quarterRating, splitIsbn } from '../../shared/library/importReadingTracker'

// Synthetic `reading list --json` output (never a real export).
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  title: 'The Test Book (Test Series, #2)',
  author: 'Ada Example',
  additionalAuthors: 'Second Author, Third Author',
  shelf: 'read',
  isbn: null,
  isbn13: '9780000000002',
  goodreadsId: null,
  description: 'A story.',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  pageCount: 412,
  yearPublished: '2017',
  originalPublicationYear: null,
  binding: null,
  format: 'physical',
  createdAt: '2026-01-02T10:00:00.000Z',
  session: { startedAt: '2026-08-01T00:00:00.000Z', finishedAt: '2026-09-24T00:00:00.000Z', rating: 4.25, review: null },
  ...overrides,
})
const exportOf = (...books: unknown[]) => JSON.stringify({ books, total: books.length })

describe('importReadingTracker', () => {
  it('maps a tracker entry onto a Book', () => {
    const { books, warnings } = importReadingTracker(exportOf(entry()))
    expect(warnings).toEqual([])
    expect(books[0]).toMatchObject({
      id: 'b1',
      title: 'The Test Book',
      seriesTitle: 'Test Series, #2',
      additionalAuthors: ['Second Author', 'Third Author'],
      isbn13: '9780000000002',
      pages: 412,
      yearPublished: 2017,
      rating: 4.25,
      status: 'read',
      dateRead: '2026-09-24',
      dateAdded: '2026-01-02',
      readCount: 1,
      description: 'A story.',
      coverUrl: 'https://cdn.example.com/cover.jpg',
    })
  })

  it('maps shelves to Regal statuses', () => {
    const { books } = importReadingTracker(exportOf(
      entry({ id: 'a', shelf: 'want-to-read', session: null }),
      entry({ id: 'b', shelf: 'currently-reading' }),
      entry({ id: 'c', shelf: 'did-not-finish' }),
    ))
    expect(books.map(book => book.status)).toEqual(['to-read', 'currently-reading', 'dnf'])
    expect(books[0]!.rating).toBe(0)
  })

  it('is picked by importLibrary for JSON input', () => {
    expect(importLibrary(exportOf(entry())).books[0]!.id).toBe('b1')
  })

  it('skips entries without id or title and rejects other JSON', () => {
    expect(importReadingTracker(exportOf(entry(), { title: 'no id' })).warnings).toHaveLength(1)
    expect(() => importReadingTracker('{"items": []}')).toThrow(NotAReadingTrackerExportError)
    expect(() => importReadingTracker('{nope')).toThrow(NotAReadingTrackerExportError)
  })
})

describe('splitIsbn', () => {
  it('sorts ISBN-13, ISBN-10 and Fable ids', () => {
    expect(splitIsbn('9781466858756', null)).toEqual({ isbn13: '9781466858756', isbn10: null })
    expect(splitIsbn('0575093137', null)).toEqual({ isbn13: null, isbn10: '0575093137' })
    expect(splitIsbn('YlsoGKoxeN', null)).toEqual({ isbn13: null, isbn10: null })
  })
})

describe('quarterRating', () => {
  it('keeps quarter steps between 0 and 5', () => {
    expect(quarterRating(4.25)).toBe(4.25)
    expect(quarterRating(3.8)).toBe(3.75)
    expect(quarterRating(7)).toBe(5)
    expect(quarterRating(null)).toBe(0)
  })
})
