import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importReadingTracker } from '../../shared/library/importReadingTracker'
import { libraryFileBooks, validateLibraryFile } from '../../shared/library/libraryFile'
import { assetReference, convertPublished, manifestKeyFor } from '../../scripts/library/fromPublished'
import type { Manifest } from '../../scripts/library/fromPublished'

// Synthetic published data (tests/fixtures/library-file/published), never the real one.
const PUBLISHED = join(import.meta.dirname, '../fixtures/library-file/published')
const libraryText = readFileSync(join(PUBLISHED, 'library.json'), 'utf8')
const manifest = JSON.parse(readFileSync(join(PUBLISHED, 'manifest.json'), 'utf8')) as Manifest
const GENERATED_AT = '2026-05-01T06:00:00.000Z'

const convert = (assetsBase?: string) => convertPublished({ libraryText, manifest, assetsBase, generatedAt: GENERATED_AT, owner: 'Ada' })

describe('convertPublished', () => {
  it('writes a valid library file with the metadata', () => {
    const { library } = convert('https://books.example.com/')
    expect(validateLibraryFile(library)).toEqual({ ok: true, library })
    expect(library).toMatchObject({ version: 2, generatedAt: GENERATED_AT, owner: 'Ada', generator: 'regal library:convert' })
    expect(library.books.map(book => book.id)).toEqual(['rt-0001', 'rt-0002', 'rt-0003', 'rt-0004'])
  })

  it('merges a Book with its manifest entry (found by ISBN-13)', () => {
    const { library } = convert('https://books.example.com/')
    expect(library.books[0]).toEqual({
      id: 'rt-0001',
      title: 'The Example Engine',
      seriesTitle: 'Example Cycle, #2',
      authors: ['Ada Example', 'Second Author', 'Third Author'],
      isbn13: '9780000000101',
      pages: 412,
      yearPublished: 2017,
      originalYear: 2016,
      status: 'read',
      dateRead: '2026-09-24',
      dateStarted: '2026-08-01',
      dateAdded: '2026-01-02',
      rating: 4.25,
      review: 'A synthetic review.',
      reviewHasSpoiler: false,
      readCount: 1,
      description: 'The cleaned blurb for this edition.',
      publisher: 'Example House',
      genre: 'SCIENCE FICTION',
      quotes: [{ text: 'A synthetic line of praise.', source: 'The Example Review' }],
      assets: {
        front: 'https://books.example.com/9780000000101/front.webp',
        spine: 'https://books.example.com/9780000000101/spine.webp',
        back: 'https://books.example.com/9780000000101/back.webp',
        pile: {
          front: 'https://books.example.com/9780000000101/front-pile.webp',
          spine: 'https://books.example.com/9780000000101/spine-pile.webp',
        },
        palette: { background: '#48445c', text: '#f5f2eb', accent: '#1c1926' },
        spineColor: '#151728',
        source: 'ai',
      },
    })
  })

  it('finds an entry by Book id and drops what the display would ignore', () => {
    const { library, warnings } = convert('https://books.example.com/')
    expect(library.books[1]).toEqual({
      id: 'rt-0002',
      title: 'No ISBN At All',
      authors: ['Bea Sample'],
      binding: 'Kindle Edition',
      status: 'currently-reading',
      dateStarted: '2026-03-02',
      dateAdded: '2026-03-01',
      rating: 0,
      reviewHasSpoiler: false,
      readCount: 0,
      assets: { front: 'https://images.example.com/rt-0002/front.webp', photoFaces: ['front'] },
    })
    expect(warnings).toEqual([
      'Skipped an entry without id or title (   )',
      'No ISBN At All (rt-0002): palette dropped (not three #rrggbb colours)',
      'No ISBN At All (rt-0002): spineColor dropped ("grey" is not #rrggbb)',
    ])
  })

  it('falls back to the tracker\'s http(s) Cover when there is no asset front', () => {
    const { library } = convert('https://books.example.com/')
    expect(library.books[2]).toMatchObject({ isbn10: '000000020X', status: 'to-read', binding: 'Paperback', assets: { front: 'https://cdn.example.com/covers/rt-0003.jpg' } })
    expect(library.books[2]).not.toHaveProperty('description')
    expect(library.books[2]).not.toHaveProperty('dateAdded')
    expect(library.books[3]).toMatchObject({ authors: [], status: 'dnf', binding: 'Audiobook', rating: 1, dateStarted: '2025-12-13' })
    expect(library.books[3]).not.toHaveProperty('assets')
  })

  it('counts what it converted', () => {
    expect(convert().stats).toEqual({
      books: 4,
      withAssets: 3,
      withFront: 3,
      withSpine: 1,
      withBack: 1,
      withPile: 1,
      withPalette: 1,
      coverFallbacks: 1,
      unusedManifestEntries: 1,
    })
  })

  it('keeps manifest paths relative without an assets base', () => {
    const assets = convert().library.books[0]!.assets!
    expect(assets.front).toBe('9780000000101/front.webp')
    expect(assets.pile).toEqual({ front: '9780000000101/front-pile.webp', spine: '9780000000101/spine-pile.webp' })
    expect(convert('book-assets').library.books[0]!.assets!.spine).toBe('book-assets/9780000000101/spine.webp')
  })

  it('works without a manifest', () => {
    const { library, stats } = convertPublished({ libraryText, generatedAt: GENERATED_AT })
    expect(validateLibraryFile(library).ok).toBe(true)
    expect(library).not.toHaveProperty('owner')
    expect(stats).toMatchObject({ books: 4, withAssets: 2, withFront: 2, coverFallbacks: 2, withPile: 0 })
  })

  it('keeps every Book field the display reads today (round trip through libraryBookToBook)', () => {
    const before = importReadingTracker(libraryText).books
    const after = libraryFileBooks(convert().library)
    const shown = ({ coverUrl: _cover, description: _description, ...rest }: (typeof before)[number]) => rest
    expect(after.map(shown)).toEqual(before.map(shown))
  })
})

describe('manifestKeyFor', () => {
  it('prefers the ISBN-13 and falls back to the Book id', () => {
    const entries: Manifest = { 9780000000101: {}, b1: {} }
    expect(manifestKeyFor({ id: 'b1', isbn13: '978-0-00-000010-1' }, entries)).toBe('9780000000101')
    expect(manifestKeyFor({ id: 'b1', isbn13: '9780000000999' }, entries)).toBe('b1')
    expect(manifestKeyFor({ id: 'b2', isbn13: null }, entries)).toBeNull()
  })
})

describe('assetReference', () => {
  it('prefixes relative paths and leaves absolute ones', () => {
    expect(assetReference('k/front.webp', 'https://books.example.com')).toBe('https://books.example.com/k/front.webp')
    expect(assetReference('k/front.webp', 'https://books.example.com/v2/')).toBe('https://books.example.com/v2/k/front.webp')
    expect(assetReference('https://cdn.example.com/a.webp', 'https://books.example.com/')).toBe('https://cdn.example.com/a.webp')
    expect(assetReference('/book-assets/a.webp', 'https://books.example.com/')).toBe('/book-assets/a.webp')
    expect(assetReference('k/front.webp')).toBe('k/front.webp')
  })
})
