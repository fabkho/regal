import { describe, expect, it } from 'vitest'
import { cleanTitle, coverCacheKey, isEmptyQuery, normalizeIsbn, resolveCover } from '../../server/utils/covers'
import type { Fetcher } from '../../server/utils/covers'

type Route = (url: string) => { status?: number, json?: unknown } | undefined

/** Stub upstreams: routes by URL substring; unknown URLs 404. Records every call. */
function stubFetch(route: Route) {
  const calls: string[] = []
  const fetch: Fetcher = async (url) => {
    calls.push(url)
    const hit = route(url)
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(hit.json ?? {}), { status: hit.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch, calls }
}

const hobbit = { isbn13: '="9780547928227"', isbn10: '054792822X', title: 'The Hobbit (Middle-earth, #0)', author: 'J.R.R. Tolkien' }

describe('resolveCover', () => {
  it('prefers the Open Library edition cover by ISBN-13, as an id-keyed URL', async () => {
    const { fetch, calls } = stubFetch(url => url.includes('/isbn/9780547928227.json') ? { json: { covers: [12003329] } } : undefined)
    const result = await resolveCover(hobbit, { fetch })
    expect(result).toEqual({ url: 'https://covers.openlibrary.org/b/id/12003329-L.jpg', source: 'openlibrary-isbn' })
    expect(calls).toHaveLength(1)
  })

  it('falls back to ISBN-10 when the ISBN-13 edition has no cover', async () => {
    const { fetch } = stubFetch((url) => {
      if (url.includes('/isbn/9780547928227.json')) return { json: { covers: [-1] } }
      if (url.includes('/isbn/054792822X.json')) return { json: { covers: [42] } }
    })
    expect((await resolveCover(hobbit, { fetch }))?.url).toContain('/b/id/42-L.jpg')
  })

  it('skips Google Books without an API key and falls back to search', async () => {
    const { fetch, calls } = stubFetch(url => url.includes('search.json') ? { json: { docs: [{ cover_i: 7 }] } } : undefined)
    const result = await resolveCover(hobbit, { fetch })
    expect(result).toEqual({ url: 'https://covers.openlibrary.org/b/id/7-L.jpg', source: 'openlibrary-search' })
    expect(calls.some(url => url.includes('googleapis'))).toBe(false)
  })

  it('uses Google Books when a key is configured', async () => {
    const { fetch } = stubFetch(url => url.includes('googleapis')
      ? { json: { items: [{ volumeInfo: { imageLinks: { thumbnail: 'http://books.google.com/x?id=1&edge=curl' } } }] } }
      : undefined)
    const result = await resolveCover(hobbit, { fetch, googleBooksApiKey: 'k' })
    expect(result).toEqual({ url: 'https://books.google.com/x?id=1', source: 'google-books' })
  })

  it('searches by cleaned title and prefers the result carrying our ISBN', async () => {
    const { fetch, calls } = stubFetch(url => url.includes('search.json')
      ? { json: { docs: [{ cover_i: 1, isbn: ['111'] }, { cover_i: 2, isbn: ['9780547928227'] }] } }
      : undefined)
    const result = await resolveCover(hobbit, { fetch })
    expect(result?.url).toContain('/b/id/2-L.jpg')
    const search = new URL(calls.find(url => url.includes('search.json'))!)
    expect(search.searchParams.get('title')).toBe('The Hobbit')
    expect(search.searchParams.get('author')).toBe('J.R.R. Tolkien')
  })

  it('treats rate limits, errors and throwing fetches as misses and returns null', async () => {
    const fetch: Fetcher = async (url) => {
      if (url.includes('search.json')) throw new Error('network down')
      return new Response('slow down', { status: 429 })
    }
    expect(await resolveCover(hobbit, { fetch })).toBeNull()
  })

  it('honours the requested size', async () => {
    const { fetch } = stubFetch(url => url.includes('/isbn/') ? { json: { covers: [5] } } : undefined)
    expect((await resolveCover(hobbit, { fetch, size: 'M' }))?.url).toContain('/b/id/5-M.jpg')
  })
})

describe('cover query helpers', () => {
  it('normalizes ISBNs from the Goodreads ="…" wrapping', () => {
    expect(normalizeIsbn('="9780547928227"')).toBe('9780547928227')
    expect(normalizeIsbn('054792822x')).toBe('054792822X')
  })

  it('cleans series suffixes and subtitles from titles', () => {
    expect(cleanTitle('Morning Star (Red Rising, #3)')).toBe('Morning Star')
    expect(cleanTitle('Sapiens: A Brief History of Humankind')).toBe('Sapiens')
  })

  it('builds stable cache keys and detects empty queries', () => {
    expect(coverCacheKey(hobbit)).toBe(coverCacheKey({ ...hobbit, isbn13: '9780547928227' }))
    expect(isEmptyQuery({ author: 'Someone' })).toBe(true)
    expect(isEmptyQuery({ title: 'Dune' })).toBe(false)
  })
})
