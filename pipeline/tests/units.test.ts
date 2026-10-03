import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { latestBooks } from '../src/assets/select'
import type { BookRecord } from '../src/enrich'
import { assetKey } from '../src/enrich'
import type { LibraryBook, RegalLibraryFile } from '../src/layer'
import { resolveRef } from '../src/load'
import { enrichedBook } from '../src/output'
import { checkPrefix, planPublish, publishSet } from '../src/publish'
import { rebaser } from '../src/run'

describe('image references of the input file', () => {
  it('resolves them like a page at the file\'s address', () => {
    const url = { url: 'https://books.example.com/v1/library.json' }
    expect(resolveRef('9780000000001/front.webp', url)).toBe('https://books.example.com/v1/9780000000001/front.webp')
    expect(resolveRef('/covers/a.webp', url)).toBe('https://books.example.com/covers/a.webp')
    expect(resolveRef('//cdn.example.com/a.webp', url)).toBe('https://cdn.example.com/a.webp')
    expect(resolveRef('https://other.example.com/a.webp', url)).toBe('https://other.example.com/a.webp')
    const path = { path: '/data/in/library.json' }
    expect(resolveRef('img/a%20b.png', path)).toBe('/data/in/img/a b.png')
    expect(resolveRef('/covers/a.webp', path)).toBeNull()
  })

  it('re-bases references of Books passed through onto the output file', () => {
    expect(rebaser({ url: 'https://books.example.com/library.json' }, '/out')('a/front.webp')).toBe('https://books.example.com/a/front.webp')
    expect(rebaser({ path: '/data/in/library.json' }, '/data/out')('img/a.png')).toBe('../in/img/a.png')
  })
})

describe('asset keys', () => {
  it('uses the ISBN-13, else a path-safe id', () => {
    expect(assetKey({ id: 'x', isbn13: '9780000000001' })).toBe('9780000000001')
    expect(assetKey({ id: 'f1e2-abc_9' })).toBe('f1e2-abc_9')
    expect(assetKey({ id: '../etc' })).toMatch(/^id-[\da-f]{16}$/)
    expect(assetKey({ id: '..' })).toMatch(/^id-[\da-f]{16}$/)
  })
})

describe('Book order for --limit', () => {
  it('takes the most recently read first, undated last', () => {
    const books = [
      { title: 'Old', status: 'read', dateRead: '2020-01-01' },
      { title: 'Undated', status: 'to-read', dateAdded: '2026-01-01' },
      { title: 'New', status: 'read', dateRead: '2026-02-01' },
    ]
    expect(latestBooks(books, 2).map(book => book.title)).toEqual(['New', 'Old'])
    expect(latestBooks(books, Infinity).map(book => book.title)).toEqual(['New', 'Old', 'Undated'])
  })
})

describe('enriched Books', () => {
  const record: BookRecord = {
    fingerprint: 'x',
    assets: { front: 'k/front.webp', palette: { background: '#000000', text: '#ffffff', accent: '#ff0000' } },
    text: { description: 'Found blurb.', genre: 'FANTASY' },
    needsAi: false,
    meta: {},
  }
  const input = { id: 'a', title: 'A', authors: [], status: 'read', genre: 'HORROR', custom: 1, assets: { front: 'https://x.test/a.jpg' } } as LibraryBook

  it('takes the record\'s assets and only the words the Book lacked; unknown fields stay', () => {
    const book = enrichedBook(input, record, ref => ref)
    expect(book.assets).toEqual(record.assets)
    expect(book.description).toBe('Found blurb.')
    expect(book.genre).toBe('HORROR')
    expect((book as unknown as { custom: number }).custom).toBe(1)
  })

  it('passes a Book without a record through, references re-based', () => {
    expect(enrichedBook({ ...input, assets: { front: 'a.webp', pile: { front: 'a-pile.webp' } } }, null, ref => `../in/${ref}`).assets)
      .toEqual({ front: '../in/a.webp', pile: { front: '../in/a-pile.webp' } })
  })
})

describe('publishing', () => {
  it('plans only changed files, JSON apart, and deletes what is gone', () => {
    expect(planPublish({ 'library.json': '2', 'a/front.webp': '1', 'b/front.webp': '3' }, { 'library.json': '1', 'a/front.webp': '1', 'c/front.webp': '9' }))
      .toEqual({ images: ['b/front.webp'], json: ['library.json'], gone: ['c/front.webp'] })
  })

  it('never writes to the bucket root', () => {
    expect(checkPrefix('v2')).toBe('v2')
    expect(checkPrefix('/v2/')).toBe('v2')
    expect(() => checkPrefix('')).toThrow()
    expect(() => checkPrefix('/')).toThrow()
    expect(() => checkPrefix(undefined)).toThrow()
    expect(() => checkPrefix('../x')).toThrow()
    expect(() => checkPrefix('v2/../..')).toThrow()
  })

  it('publishes only images inside the output folder, and refuses a file naming missing ones', () => {
    const out = mkdtempSync(join(tmpdir(), 'regal-publish-'))
    try {
      mkdirSync(join(out, 'k'))
      writeFileSync(join(out, 'k/front.webp'), 'x')
      const library = (assets: LibraryBook['assets']): RegalLibraryFile => ({ version: 2, generatedAt: '2026-01-01T00:00:00Z', books: [{ id: 'a', title: 'A', authors: [], status: 'read', assets }] })
      expect([...publishSet(out, library({ front: 'k/front.webp', back: 'https://x.test/b.webp' })).keys()]).toEqual(['library.json', 'k/front.webp'])
      expect(() => publishSet(out, library({ front: 'k/front.webp', spine: 'k/spine.webp' }))).toThrow(/Not published/)
      expect(() => publishSet(out, library({ front: '../in/a.png' }))).toThrow(/Not published/)
      expect(() => publishSet(out, library({ front: '/books/a.webp' }))).toThrow(/Not published/)
    }
    finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})
