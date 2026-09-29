// GET /api/description?isbn13=&isbn10=&title=&author=
// → { description: string | null, source }. Cached like Cover lookups.
import type { CoverQuery, Fetcher } from '../utils/covers'
import { coverCacheKey, isEmptyQuery } from '../utils/covers'
import { resolveDescription } from '../utils/descriptions'

const DAY = 60 * 60 * 24

const lookupDescription = defineCachedFunction(
  async (_key: string, query: CoverQuery) => {
    const config = useRuntimeConfig()
    return resolveDescription(query, {
      fetch: globalThis.fetch as Fetcher,
      googleBooksApiKey: config.googleBooksApiKey || undefined,
    })
  },
  {
    name: 'description-lookup',
    maxAge: 30 * DAY,
    getKey: (key: string) => key,
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
  if (isEmptyQuery(query)) {
    throw createError({ statusCode: 400, statusMessage: 'Give an ISBN or a title' })
  }
  const resolved = await lookupDescription(coverCacheKey(query), query)
  setResponseHeader(event, 'Cache-Control', `public, max-age=${resolved ? 7 * DAY : DAY}`)
  return { description: resolved?.description ?? null, source: resolved?.source ?? null }
})
