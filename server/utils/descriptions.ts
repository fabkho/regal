// Book descriptions ("blurbs") for the back cover and the details card.
// Same shape as the Cover resolver: pure apart from the injected fetch.
import type { CoverQuery, Fetcher } from './covers'
import { cleanTitle, getJson, normalizeIsbn } from './covers'

export type DescriptionSource = 'openlibrary-isbn' | 'google-books' | 'openlibrary-search'

export interface ResolvedDescription {
  description: string
  source: DescriptionSource
}

export interface DescriptionOptions {
  fetch: Fetcher
  googleBooksApiKey?: string
  timeoutMs?: number
}

/** Longest blurb we keep; the back cover shows less. */
export const MAX_DESCRIPTION = 1200

type OpenLibraryText = string | { value?: string } | undefined

const textOf = (value: OpenLibraryText) => (typeof value === 'string' ? value : value?.value) ?? ''

/**
 * Tidies a blurb: drops HTML, Open Library's markdown links and source
 * footnotes ("([source][1])", "----------" + link lists), collapses spaces,
 * and trims to a sentence boundary under MAX_DESCRIPTION.
 */
export function cleanDescription(raw: string): string {
  let text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .split(/\n-{3,}\s*\n/)[0]! // Open Library appends "----------" + source/also-contained lists
    .replace(/\(\[[^\]]*\]\[\d+\]\)/g, '') // ([source][1])
    .replace(/\[([^\]]+)\]\[\d+\]/g, '$1') // [text][1]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .replace(/^\s*\[\d+\]:.*$/gm, '') // [1]: https://…
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length > MAX_DESCRIPTION) {
    const cut = text.slice(0, MAX_DESCRIPTION)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
    text = end > MAX_DESCRIPTION * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
  }
  return text
}

async function workDescription(workKey: string | undefined, options: DescriptionOptions): Promise<string> {
  if (!workKey) return ''
  const work = await getJson<{ description?: OpenLibraryText }>(`https://openlibrary.org${workKey}.json`, options)
  return textOf(work?.description)
}

/** Open Library edition by ISBN: its own description, else its work's. */
async function fromOpenLibraryIsbn(query: CoverQuery, options: DescriptionOptions): Promise<string> {
  for (const isbn of [normalizeIsbn(query.isbn13), normalizeIsbn(query.isbn10)]) {
    if (!isbn) continue
    const edition = await getJson<{ description?: OpenLibraryText, works?: { key: string }[] }>(`https://openlibrary.org/isbn/${isbn}.json`, options)
    if (!edition) continue
    const text = textOf(edition.description) || await workDescription(edition.works?.[0]?.key, options)
    if (text) return text
  }
  return ''
}

async function fromGoogleBooks(query: CoverQuery, options: DescriptionOptions): Promise<string> {
  if (!options.googleBooksApiKey) return ''
  for (const isbn of [normalizeIsbn(query.isbn13), normalizeIsbn(query.isbn10)]) {
    if (!isbn) continue
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${encodeURIComponent(options.googleBooksApiKey)}`
    const result = await getJson<{ items?: { volumeInfo?: { description?: string } }[] }>(url, options)
    const text = result?.items?.find(item => item.volumeInfo?.description)?.volumeInfo?.description
    if (text) return text
  }
  return ''
}

/** Open Library search by title + author → the work's description. */
async function fromOpenLibrarySearch(query: CoverQuery, options: DescriptionOptions): Promise<string> {
  const title = cleanTitle(query.title)
  if (!title) return ''
  const params = new URLSearchParams({ title, fields: 'key', limit: '3' })
  if (query.author?.trim()) params.set('author', query.author.trim())
  const result = await getJson<{ docs?: { key?: string }[] }>(`https://openlibrary.org/search.json?${params}`, options)
  for (const doc of result?.docs ?? []) {
    const text = await workDescription(doc.key, options)
    if (text) return text
  }
  return ''
}

const SOURCES: [DescriptionSource, (query: CoverQuery, options: DescriptionOptions) => Promise<string>][] = [
  ['openlibrary-isbn', fromOpenLibraryIsbn],
  ['google-books', fromGoogleBooks],
  ['openlibrary-search', fromOpenLibrarySearch],
]

export async function resolveDescription(query: CoverQuery, options: DescriptionOptions): Promise<ResolvedDescription | null> {
  for (const [source, lookup] of SOURCES) {
    const description = cleanDescription(await lookup(query, options))
    if (description) return { description, source }
  }
  return null
}
