import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatLibraryFileErrors, libraryBookToBook, libraryFileBooks, parseLibraryFile, validateLibraryFile } from '../../shared/library/libraryFile'
import type { LibraryFileError, RegalLibraryFile } from '../../shared/types/libraryFile'

// Synthetic fixtures only (tests/fixtures/library-file).
const FIXTURES = join(import.meta.dirname, '../fixtures/library-file')
const fixtureText = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')
const fixture = (name: string) => JSON.parse(fixtureText(name)) as Record<string, unknown>

function errorsOf(text: string): LibraryFileError[] {
  const result = parseLibraryFile(text)
  if (result.ok) throw new Error('expected the file to be invalid')
  return result.errors
}

const pathsOf = (errors: LibraryFileError[]) => errors.map(error => error.path)

describe('validateLibraryFile: valid files', () => {
  it.each(['demo.json', 'all-fields.json', 'minimal.json'])('accepts %s', (name) => {
    const data = fixture(name)
    const result = validateLibraryFile(data)
    expect(result).toEqual({ ok: true, library: data })
  })

  it('accepts a byte order mark', () => {
    expect(parseLibraryFile(`\uFEFF${fixtureText('minimal.json')}`).ok).toBe(true)
  })

  it('accepts an empty Library', () => {
    expect(validateLibraryFile({ version: 2, generatedAt: '2026-05-01T06:00:00Z', books: [] }).ok).toBe(true)
  })

  it('accepts every quarter star from 0 to 5', () => {
    const books = Array.from({ length: 21 }, (_, index) => ({ id: `b${index}`, title: 'T', authors: [], status: 'read', rating: index / 4 }))
    expect(validateLibraryFile({ version: 2, generatedAt: '2026-05-01T06:00:00Z', books }).ok).toBe(true)
  })
})

describe('validateLibraryFile: invalid files', () => {
  it('reports JSON that does not parse', () => {
    const errors = errorsOf(fixtureText('invalid/truncated.json'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe('')
    expect(errors[0]!.reason).toMatch(/^is not valid JSON/)
  })

  it('reports JSON that is not an object', () => {
    expect(errorsOf(fixtureText('invalid/not-an-object.json'))).toEqual([{ path: '', reason: 'must be a JSON object, got an array' }])
  })

  it('stops at an unknown version', () => {
    expect(errorsOf(fixtureText('invalid/wrong-version.json'))).toEqual([{ path: 'version', reason: 'must be 2, got 1' }])
    expect(errorsOf('{ "version": "2", "books": [] }')).toEqual([{ path: 'version', reason: 'must be 2, got "2"' }])
  })

  it('points a reading-tracker export at the converter', () => {
    const errors = errorsOf(fixtureText('invalid/reading-tracker-export.json'))
    expect(pathsOf(errors)).toEqual(['version'])
    expect(errors[0]!.reason).toContain('pnpm library:convert')
  })

  it('reports broken metadata', () => {
    expect(errorsOf(fixtureText('invalid/bad-metadata.json'))).toEqual([
      { path: 'generatedAt', reason: 'must be an ISO 8601 date-time with Z or an offset (2026-05-01T06:00:00Z), got "2026-05-01"' },
      { path: 'owner', reason: 'must be a string or null, got number' },
      { path: 'books', reason: 'must be an array, got an object' },
    ])
  })

  it('reports every broken Book field with its path', () => {
    const errors = errorsOf(fixtureText('invalid/bad-books.json'))
    expect(pathsOf(errors)).toEqual([
      'books[0]',
      'books[1].id',
      'books[1].title',
      'books[1].authors',
      'books[2].seriesTitle',
      'books[2].authors[1]',
      'books[2].isbn13',
      'books[2].isbn10',
      'books[2].pages',
      'books[2].yearPublished',
      'books[2].originalYear',
      'books[2].status',
      'books[2].dateRead',
      'books[2].dateStarted',
      'books[2].dateAdded',
      'books[2].rating',
      'books[2].review',
      'books[2].reviewHasSpoiler',
      'books[2].readCount',
      'books[2].description',
      'books[2].quotes[0].text',
      'books[2].quotes[0].source',
      'books[2].quotes[1]',
      'books[3].rating',
      'books[4].id',
    ])
    const reason = (path: string) => errors.find(error => error.path === path)!.reason
    expect(reason('books[0]')).toBe('must be an object, got string')
    expect(reason('books[1].title')).toBe('must not be empty')
    expect(reason('books[2].isbn13')).toContain('no hyphens')
    expect(reason('books[2].dateRead')).toBe('must be a date as YYYY-MM-DD or null, got "2026-02-30"')
    expect(reason('books[2].rating')).toBe('must be quarter stars from 0 to 5 (0, 0.25 … 5) or null, got 4.3')
    expect(reason('books[3].rating')).toContain('got 6')
    expect(reason('books[4].id')).toBe('must be unique, "too-many-stars" is also books[3].id')
  })

  it('reports broken assets with their path', () => {
    const errors = errorsOf(fixtureText('invalid/bad-assets.json'))
    expect(errors).toEqual([
      { path: 'books[0].assets.front', reason: 'must be an http(s) URL or a relative path, got a data: URL' },
      { path: 'books[0].assets.spine', reason: 'must be a URL without spaces, got "spine art.webp"' },
      { path: 'books[0].assets.back', reason: 'must be a URL or null, got number' },
      { path: 'books[0].assets.pile.front', reason: 'must be an http(s) URL or a relative path, got a javascript: URL' },
      { path: 'books[0].assets.palette.background', reason: 'must be a colour as #rrggbb, got "#fff"' },
      { path: 'books[0].assets.palette.accent', reason: 'is required in a palette (a colour as #rrggbb)' },
      { path: 'books[0].assets.spineColor', reason: 'must be a colour as #rrggbb, got "red"' },
      { path: 'books[0].assets.photoFaces[1]', reason: 'must be one of front, spine, back, got "side"' },
      { path: 'books[0].assets.source', reason: 'must be one of photo, ai or null, got "scan"' },
      { path: 'books[1].assets', reason: 'must be an object or null, got string' },
    ])
  })

  it('sums up errors beyond the first hundred', () => {
    const books = Array.from({ length: 150 }, (_, index) => ({ id: `b${index}`, title: 'T', authors: [], status: 'read', rating: 9 }))
    const result = validateLibraryFile({ version: 2, generatedAt: '2026-05-01T06:00:00Z', books })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(101)
    expect(result.errors.at(-1)).toEqual({ path: '', reason: '…and 50 more error(s)' })
  })

  it('formats errors as lines', () => {
    expect(formatLibraryFileErrors([{ path: 'books[2].rating', reason: 'must be …' }, { path: '', reason: 'is not valid JSON' }]))
      .toEqual(['books[2].rating: must be …', '(file): is not valid JSON'])
  })
})

describe('libraryBookToBook', () => {
  it('maps a library file Book onto Regal\'s Book', () => {
    const library = fixture('demo.json') as unknown as RegalLibraryFile
    const [first, second, , omens, , , , anonymous] = libraryFileBooks(library)
    expect(second).toEqual({
      id: 'demo-02',
      title: 'Frankenstein',
      seriesTitle: null,
      author: 'Mary Shelley',
      additionalAuthors: [],
      isbn10: '0000000027',
      isbn13: '9780000000026',
      pages: 280,
      binding: 'Hardcover',
      yearPublished: 2012,
      originalYear: 1818,
      rating: 4.75,
      status: 'read',
      tags: [],
      dateRead: '2026-03-14',
      dateAdded: '2026-02-27',
      review: 'The creature is the most human character in it.',
      reviewHasSpoiler: false,
      readCount: 2,
      description: 'A young scientist builds a living being and then abandons it.',
      coverUrl: null,
    })
    expect(first!.status).toBe('currently-reading')
    expect([omens!.author, omens!.additionalAuthors]).toEqual(['Terry Pratchett', ['Neil Gaiman']])
    expect(anonymous).toMatchObject({ author: null, additionalAuthors: [], pages: null, binding: null, rating: 1.25, reviewHasSpoiler: false, readCount: 0, description: null })
  })

  it('fills defaults for nulls', () => {
    const library = fixture('all-fields.json') as unknown as RegalLibraryFile
    expect(libraryBookToBook(library.books[1]!)).toMatchObject({ rating: 0, reviewHasSpoiler: false, readCount: 0, seriesTitle: null, isbn13: null })
  })
})
