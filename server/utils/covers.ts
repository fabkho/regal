// Cover resolver: finds a Cover image URL for a Book by walking Cover sources
// in order. Pure apart from the injected fetch, so it can be tested with
// stubbed upstreams. See the spec (#1) "Cover resolver contract".

export interface CoverQuery {
  isbn13?: string | null
  isbn10?: string | null
  title?: string | null
  author?: string | null
}

export type CoverSourceName = 'openlibrary-isbn' | 'google-books' | 'openlibrary-search'

export interface ResolvedCover {
  url: string
  source: CoverSourceName
}

export type Fetcher = (url: string, init?: { headers?: Record<string, string>, signal?: AbortSignal }) => Promise<Response>

export interface ResolveOptions {
  fetch: Fetcher
  googleBooksApiKey?: string
  size?: 'M' | 'L'
  timeoutMs?: number
}

export const USER_AGENT = 'Regal/0.1 (+https://github.com/fabkho/regal)'

const clean = (value: string | null | undefined) => (value ?? '').trim()

/** ISBN digits only (keeps a trailing X). */
export function normalizeIsbn(value: string | null | undefined): string {
  return clean(value).replace(/[^0-9X]/gi, '').toUpperCase()
}

/** "Morning Star (Red Rising, #3)" → "Morning Star"; drops subtitles after ":". */
export function cleanTitle(title: string | null | undefined): string {
  return clean(title)
    .replace(/\s*\([^()]*\)\s*$/, '')
    .split(':')[0]!
    .trim()
}

/** Stable cache key for a query. */
export function coverCacheKey(query: CoverQuery): string {
  return [
    normalizeIsbn(query.isbn13),
    normalizeIsbn(query.isbn10),
    cleanTitle(query.title).toLowerCase(),
    clean(query.author).toLowerCase(),
  ].join('|')
}

export async function getJson<T>(url: string, options: Pick<ResolveOptions, 'fetch' | 'timeoutMs'>): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000)
  try {
    const response = await options.fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json() as T
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

const openLibraryCoverUrl = (coverId: number, size: 'M' | 'L') =>
  `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`

/** Source 1: Open Library edition by ISBN → cover id (id-keyed covers aren't rate-limited). */
async function fromOpenLibraryIsbn(query: CoverQuery, options: ResolveOptions): Promise<string | null> {
  for (const isbn of [normalizeIsbn(query.isbn13), normalizeIsbn(query.isbn10)]) {
    if (!isbn) continue
    const edition = await getJson<{ covers?: number[] }>(`https://openlibrary.org/isbn/${isbn}.json`, options)
    const coverId = edition?.covers?.find(id => id > 0)
    if (coverId) return openLibraryCoverUrl(coverId, options.size ?? 'L')
  }
  return null
}

/** Source 2: Google Books by ISBN — only with an API key (the anonymous quota is shared and exhausted). */
async function fromGoogleBooks(query: CoverQuery, options: ResolveOptions): Promise<string | null> {
  if (!options.googleBooksApiKey) return null
  for (const isbn of [normalizeIsbn(query.isbn13), normalizeIsbn(query.isbn10)]) {
    if (!isbn) continue
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${encodeURIComponent(options.googleBooksApiKey)}`
    const result = await getJson<{ items?: { volumeInfo?: { imageLinks?: Record<string, string> } }[] }>(url, options)
    const links = result?.items?.find(item => item.volumeInfo?.imageLinks)?.volumeInfo?.imageLinks
    const link = links?.extraLarge ?? links?.large ?? links?.medium ?? links?.thumbnail ?? links?.smallThumbnail
    if (link) return link.replace(/^http:/, 'https:').replace('&edge=curl', '')
  }
  return null
}

/** Source 3: Open Library search by cleaned title + author; prefers a result carrying our ISBN. */
async function fromOpenLibrarySearch(query: CoverQuery, options: ResolveOptions): Promise<string | null> {
  const title = cleanTitle(query.title)
  if (!title) return null
  const params = new URLSearchParams({ title, fields: 'cover_i,isbn', limit: '10' })
  const author = clean(query.author)
  if (author) params.set('author', author)
  const result = await getJson<{ docs?: { cover_i?: number, isbn?: string[] }[] }>(`https://openlibrary.org/search.json?${params}`, options)
  const docs = (result?.docs ?? []).filter(doc => doc.cover_i && doc.cover_i > 0)
  const isbns = new Set([normalizeIsbn(query.isbn13), normalizeIsbn(query.isbn10)].filter(Boolean))
  const match = docs.find(doc => doc.isbn?.some(isbn => isbns.has(normalizeIsbn(isbn)))) ?? docs[0]
  return match?.cover_i ? openLibraryCoverUrl(match.cover_i, options.size ?? 'L') : null
}

const SOURCES: [CoverSourceName, (query: CoverQuery, options: ResolveOptions) => Promise<string | null>][] = [
  ['openlibrary-isbn', fromOpenLibraryIsbn],
  ['google-books', fromGoogleBooks],
  ['openlibrary-search', fromOpenLibrarySearch],
]

/** Walks the Cover sources in order and returns the first hit, or null. */
export async function resolveCover(query: CoverQuery, options: ResolveOptions): Promise<ResolvedCover | null> {
  for (const [source, lookup] of SOURCES) {
    const url = await lookup(query, options)
    if (url) return { url, source }
  }
  return null
}

/** True when the query carries nothing we can look a Cover up by. */
export function isEmptyQuery(query: CoverQuery): boolean {
  return !normalizeIsbn(query.isbn13) && !normalizeIsbn(query.isbn10) && !cleanTitle(query.title)
}
