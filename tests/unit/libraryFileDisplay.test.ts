import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  invalidFileError,
  NO_SOURCE_ERROR,
  readLibraryFile,
  resolveLibraryUrl,
  SHOWN_ERRORS,
  unreachableFileError,
} from '../../app/utils/library/libraryFile'
import { assetFaces } from '../../app/utils/covers/bookAssets'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/library-file/${name}`, import.meta.url), 'utf8')

describe('resolveLibraryUrl', () => {
  const page = 'https://fabkho.dev/books?sort=rating'

  it('resolves references against the library file, like a link in a page at its address', () => {
    const src = 'https://books.example.com/v2/library.json'
    expect(resolveLibraryUrl('9780756413026/front.webp', src, page)).toBe('https://books.example.com/v2/9780756413026/front.webp')
    expect(resolveLibraryUrl('./a.webp', src, page)).toBe('https://books.example.com/v2/a.webp')
    expect(resolveLibraryUrl('../a.webp', src, page)).toBe('https://books.example.com/a.webp')
    expect(resolveLibraryUrl('/books/a.webp', src, page)).toBe('https://books.example.com/books/a.webp')
    expect(resolveLibraryUrl('//cdn.example.com/a.webp', src, page)).toBe('https://cdn.example.com/a.webp')
    expect(resolveLibraryUrl('https://cdn.example.com/a%20b.webp', src, page)).toBe('https://cdn.example.com/a%20b.webp')
  })

  it('takes a file URL relative to the page first', () => {
    expect(resolveLibraryUrl('fx-001/front.webp', '/books/library.json', page)).toBe('https://fabkho.dev/books/fx-001/front.webp')
    expect(resolveLibraryUrl('a.webp', 'data/library.json', 'https://example.com/shelf/')).toBe('https://example.com/shelf/data/a.webp')
  })

  it('refuses anything but http(s)', () => {
    const src = 'https://books.example.com/library.json'
    expect(resolveLibraryUrl('javascript:alert(1)', src, page)).toBeNull()
    expect(resolveLibraryUrl('data:image/png;base64,AAAA', src, page)).toBeNull()
    expect(resolveLibraryUrl('a.webp', 'http://[bad', page)).toBeNull()
  })

  it('gives a Book its faces at the file\'s address', () => {
    const src = 'https://books.example.com/v2/library.json'
    const faces = assetFaces({ front: 'k/front.webp', pile: { spine: 'k/spine-pile.webp' } }, reference => resolveLibraryUrl(reference, src, page))
    expect(faces.front).toBe('https://books.example.com/v2/k/front.webp')
    expect(faces.spine).toBe('https://books.example.com/v2/k/spine-pile.webp')
  })
})

describe('readLibraryFile', () => {
  it('reads every Book with its faces and the back-cover extras', () => {
    const result = readLibraryFile(fixture('all-fields.json'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { books, assets, owner } = result.library
    expect(books.length).toBeGreaterThan(0)
    expect(owner).toBeNull()
    const withAssets = books.filter(book => assets[book.id])
    expect(withAssets.length).toBeGreaterThan(0)
    // Nothing null travels in the payload.
    for (const entry of Object.values(assets)) {
      expect(Object.values(entry).every(value => value !== null && value !== undefined)).toBe(true)
    }
  })

  it('keeps image references as written, to resolve where the images load', () => {
    const file = {
      version: 2,
      generatedAt: '2026-05-01T06:00:00Z',
      books: [
        {
          id: 'a',
          title: 'A',
          authors: ['Someone'],
          status: 'read',
          genre: 'SCIENCE FICTION',
          publisher: 'Example',
          quotes: [{ text: 'Great.', source: '' }],
          assets: { front: 'a/front.webp', pile: { front: 'a/front-pile.webp', spine: null }, spineColor: '#112233', photoFaces: ['back'] },
        },
        { id: 'b', title: 'B', authors: [], status: 'to-read', assets: null },
        // A pile without copies is no pile: the full faces stand in (and the entrance waits less).
        { id: 'c', title: 'C', authors: [], status: 'read', assets: { front: 'c/front.webp', pile: { front: null } } },
      ],
    }
    const result = readLibraryFile(JSON.stringify(file))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.library.assets).toEqual({
      a: {
        front: 'a/front.webp',
        pile: { front: 'a/front-pile.webp', spine: undefined },
        spineColor: '#112233',
        photoFaces: ['back'],
        quotes: [{ text: 'Great.', source: '' }],
        genre: 'SCIENCE FICTION',
        publisher: 'Example',
      },
      c: { front: 'c/front.webp' },
    })
    expect(result.library.books.map(book => book.id)).toEqual(['a', 'b', 'c'])
    expect(result.library.owner).toBeNull()
  })

  it('reads a Library without Books', () => {
    const result = readLibraryFile(JSON.stringify({ version: 2, generatedAt: '2026-05-01T06:00:00Z', books: [] }))
    expect(result).toEqual({ ok: true, library: { books: [], assets: {}, owner: null } })
  })

  it('reads the demo library the site shows (a copy of the fixture)', () => {
    const demo = readFileSync(new URL('../../demo/demo-library.json', import.meta.url), 'utf8')
    expect(demo).toBe(fixture('demo.json'))
    const result = readLibraryFile(demo)
    expect(result.ok && result.library.books.length).toBe(8)
  })
})

describe('the error state', () => {
  it('names an invalid file and lists its first errors', () => {
    const result = readLibraryFile(fixture('invalid/bad-books.json'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('This is not a valid Regal library file.')
    expect(result.error.details.length).toBeGreaterThan(0)
    expect(result.error.details.length).toBeLessThanOrEqual(SHOWN_ERRORS)
    expect(result.error.details.every(line => /^\S.*: /.test(line))).toBe(true)
  })

  it('tells a reading-tracker export (today\'s library.json) from a library file', () => {
    const result = readLibraryFile(fixture('invalid/reading-tracker-export.json'))
    expect(!result.ok && result.error.details[0]).toMatch(/^version: is missing: this looks like a reading-tracker export/)
  })

  it('reports broken JSON', () => {
    const result = readLibraryFile(fixture('invalid/truncated.json'))
    expect(!result.ok && result.error.details[0]).toMatch(/^\(file\): is not valid JSON/)
  })

  it('counts what it doesn\'t list, the validator\'s own overflow too', () => {
    const errors = Array.from({ length: 8 }, (_, index) => ({ path: `books[${index}].title`, reason: 'must not be empty' }))
    expect(invalidFileError(errors)).toEqual({
      message: 'This is not a valid Regal library file.',
      details: errors.slice(0, SHOWN_ERRORS).map(({ path, reason }) => `${path}: ${reason}`),
      more: 3,
    })
    const capped = [...errors, { path: '', reason: '…and 40 more error(s)' }]
    expect(invalidFileError(capped).more).toBe(43)
    expect(invalidFileError(errors.slice(0, 2))).toMatchObject({ more: 0 })
    expect(invalidFileError(errors.slice(0, 2)).details).toHaveLength(2)
  })

  it('keeps a long URL readable', () => {
    const error = unreachableFileError(`data:application/json,${'x'.repeat(5000)}`, new Error('bad'))
    expect(error.details[0]!.length).toBeLessThanOrEqual(200)
    expect(error.details[0]!.endsWith('…')).toBe(true)
  })

  it('says why a file didn\'t load, and what to set when there is none', () => {
    expect(unreachableFileError('/books/library.json', new Error('[GET] "/books/library.json": 404 Not Found'))).toEqual({
      message: 'Could not load the library file.',
      details: ['/books/library.json: [GET] "/books/library.json": 404 Not Found'],
      more: 0,
    })
    expect(NO_SOURCE_ERROR.details[0]).toContain('librarySrc')
  })
})
