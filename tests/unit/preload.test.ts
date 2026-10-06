import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { booksAtRest, clearPreloads, preloadRegal } from '../../app/utils/preload'
import { clearLibraryFiles, fetchLibraryFile, readLibraryFileNow } from '../../app/utils/library/libraryCache'
import { readLibraryFile } from '../../app/utils/library/libraryFile'
import { rowBooks } from '../../app/utils/row/layout'

// Synthetic fixture only (tests/fixtures/library-file).
const DEMO = readFileSync(join(import.meta.dirname, '../fixtures/library-file/demo.json'), 'utf8')
const SRC = 'https://books.example/v2/library.json'
const PAGE = 'https://host.example/profile'

function stubBrowser(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('window', { location: { href: PAGE }, innerWidth: 412, devicePixelRatio: 2 })
  vi.stubGlobal('fetch', fetch)
}

const ok = () => vi.fn(async () => new Response(DEMO, { status: 200 }))

beforeEach(() => {
  clearPreloads()
  clearLibraryFiles()
})
afterEach(() => vi.unstubAllGlobals())

describe('preloadRegal', () => {
  it('does nothing on the server (no window)', async () => {
    const fetch = ok()
    vi.stubGlobal('fetch', fetch)
    await preloadRegal({ src: SRC, chunk: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches and reads the library file once, for the row to show at once', async () => {
    const fetch = ok()
    stubBrowser(fetch)
    const first = preloadRegal({ src: SRC, chunk: false, spines: false })
    expect(preloadRegal({ src: SRC, chunk: false, spines: false })).toBe(first)
    await first
    // Another warm-up and the row's own load reuse the file read.
    await preloadRegal({ src: SRC, chunk: false, spines: 3 })
    const result = await fetchLibraryFile(SRC)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(readLibraryFileNow(SRC)).toBe(result)
  })

  it('resolves a relative src against the page, as the row does', async () => {
    const fetch = ok()
    stubBrowser(fetch)
    await preloadRegal({ src: '/books/library.json', chunk: false, spines: false })
    expect(fetch.mock.calls[0]![0]).toBe('https://host.example/books/library.json')
    expect(readLibraryFileNow('https://host.example/books/library.json')?.ok).toBe(true)
  })

  it('never rejects, and tries again after a failure', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503, statusText: 'Unavailable' }))
    stubBrowser(fetch)
    await expect(preloadRegal({ src: SRC, chunk: false })).resolves.toBeUndefined()
    fetch.mockImplementation(async () => new Response(DEMO, { status: 200 }))
    await preloadRegal({ src: SRC, chunk: false, spines: false })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(readLibraryFileNow(SRC)?.ok).toBe(true)
  })

  it('without a library file to warm, does nothing', async () => {
    const fetch = ok()
    stubBrowser(fetch)
    await preloadRegal({ chunk: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('booksAtRest', () => {
  const read = readLibraryFile(DEMO)
  if (!read.ok) throw new Error('demo fixture')
  const library = read.library
  const shown = rowBooks(library.books)

  it('a profile row opens on its newest Books (flush right)', () => {
    const books = booksAtRest(library, { width: 412, height: 288 }).map(entry => entry.book.id)
    expect(books[0]).toBe(shown[0]!.id)
    expect(books.length).toBeGreaterThan(0)
    expect(booksAtRest(library, { spines: 2 }).map(entry => entry.book.id)).toEqual([shown[0]!.id, shown[1]!.id])
  })

  it('a year row opens on its January (flush left)', () => {
    const year = Number(shown.find(book => book.dateRead)!.dateRead!.slice(0, 4))
    const books = rowBooks(library.books, { year })
    expect(booksAtRest(library, { year, spines: 1 }).map(entry => entry.book.id)).toEqual([books.at(-1)!.id])
  })

  it('a narrow card shows fewer Books than a wide one', () => {
    expect(booksAtRest(library, { width: 120, height: 288 }).length).toBeLessThanOrEqual(booksAtRest(library, { width: 1200, height: 288 }).length)
  })
})

describe('a failed load is never kept', () => {
  it('libraryCache: a failed fetch, bad JSON and an invalid file are asked for again; a valid one is kept', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Boom' }))
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"version":1}', { status: 200 }))
      .mockImplementation(async () => new Response(DEMO, { status: 200 }))
    stubBrowser(fetch)
    await expect(fetchLibraryFile(SRC)).rejects.toThrow('Failed to fetch')
    await expect(fetchLibraryFile(SRC)).rejects.toThrow('500')
    expect((await fetchLibraryFile(SRC)).ok).toBe(false)
    expect(readLibraryFileNow(SRC)).toBeNull()
    expect((await fetchLibraryFile(SRC)).ok).toBe(false)
    expect(readLibraryFileNow(SRC)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(4)

    const loaded = await fetchLibraryFile(SRC)
    expect(loaded.ok).toBe(true)
    expect(await fetchLibraryFile(SRC)).toBe(loaded)
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('libraryCache: concurrent calls share one request; fresh joins one in flight, rereads a finished one', async () => {
    const fetch = ok()
    stubBrowser(fetch)
    const first = fetchLibraryFile(SRC)
    expect(fetchLibraryFile(SRC)).toBe(first)
    expect(fetchLibraryFile(SRC, true)).toBe(first)
    await first
    expect(fetch).toHaveBeenCalledTimes(1)
    await fetchLibraryFile(SRC, true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('preloadRegal: a warm-up whose file is not valid is tried again, a rejected fetch is dropped', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async () => new Response(DEMO, { status: 200 }))
    stubBrowser(fetch)
    await preloadRegal({ src: SRC, chunk: false, spines: false })
    expect(readLibraryFileNow(SRC)).toBeNull()
    await preloadRegal({ src: SRC, chunk: false, spines: false })
    expect(fetch).toHaveBeenCalledTimes(2)
    await preloadRegal({ src: SRC, chunk: false, spines: false })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(readLibraryFileNow(SRC)?.ok).toBe(true)
    // Loaded: kept, no more requests.
    await preloadRegal({ src: SRC, chunk: false, spines: false })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
