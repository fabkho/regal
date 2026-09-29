// GET /api/cover?isbn13=&isbn10=&title=&author=&size=M|L
// Finds a Cover via the Cover sources and proxies the image same-origin, so
// WebGL can use it as a texture without CORS trouble. See #1 "Cover resolver".
import type { CoverQuery, Fetcher } from '../utils/covers'
import { coverCacheKey, isEmptyQuery, resolveCover, USER_AGENT } from '../utils/covers'

const DAY = 60 * 60 * 24

/** Lookup results (query → upstream image URL) are cached for 30 days; misses aren't cached. */
const lookupCover = defineCachedFunction(
  async (_key: string, query: CoverQuery, size: 'M' | 'L') => {
    const config = useRuntimeConfig()
    return resolveCover(query, {
      fetch: globalThis.fetch as Fetcher,
      googleBooksApiKey: config.googleBooksApiKey || undefined,
      size,
    })
  },
  {
    name: 'cover-lookup',
    maxAge: 30 * DAY,
    getKey: (key: string, _query: CoverQuery, size: 'M' | 'L') => `${size}:${key}`,
    validate: entry => entry.value != null,
  },
)

export default defineEventHandler(async (event) => {
  const raw = getQuery(event)
  const query: CoverQuery = {
    isbn13: typeof raw.isbn13 === 'string' ? raw.isbn13 : null,
    isbn10: typeof raw.isbn10 === 'string' ? raw.isbn10 : null,
    title: typeof raw.title === 'string' ? raw.title : null,
    author: typeof raw.author === 'string' ? raw.author : null,
  }
  const size = raw.size === 'M' ? 'M' : 'L'

  if (isEmptyQuery(query)) {
    throw createError({ statusCode: 400, statusMessage: 'Give an ISBN or a title' })
  }

  const resolved = await lookupCover(coverCacheKey(query), query, size)
  if (!resolved) {
    // Let the browser remember the miss for a day instead of asking again.
    setResponseHeader(event, 'Cache-Control', `public, max-age=${DAY}`)
    throw createError({ statusCode: 404, statusMessage: 'No cover found' })
  }

  const image = await fetch(resolved.url, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null)
  const contentType = image?.headers.get('content-type') ?? ''
  if (!image?.ok || !contentType.startsWith('image/')) {
    throw createError({ statusCode: 502, statusMessage: 'Cover source failed' })
  }

  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Cover-Source': resolved.source,
  })
  return Buffer.from(await image.arrayBuffer())
})
