// Client-side blurb loading through /api/description, a few at a time and
// cached per Book for the page's lifetime.
import type { CoverBook } from './coverUrl'
import { schedule } from './coverTextures'

const cache = new Map<string, Promise<string | null>>()

/** Bump when the resolver changes, so browsers drop blurbs (and misses) they cached. */
const RESOLVER_VERSION = '3'

export function descriptionUrl(book: CoverBook): string {
  const params = new URLSearchParams({ v: RESOLVER_VERSION })
  if (book.isbn13) params.set('isbn13', book.isbn13)
  if (book.isbn10) params.set('isbn10', book.isbn10)
  if (book.title) params.set('title', book.title)
  if (book.author) params.set('author', book.author)
  return `/api/description?${params}`
}

export function loadDescription(book: CoverBook): Promise<string | null> {
  const url = descriptionUrl(book)
  let pending = cache.get(url)
  if (!pending) {
    pending = schedule(() => fetch(url).then(response => (response.ok ? response.json() : null)))
      .then((body: { description?: string | null } | null) => body?.description ?? null)
      .catch(() => null)
    cache.set(url, pending)
  }
  return pending
}
