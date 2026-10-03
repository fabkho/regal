// Book descriptions ("blurbs") for the back cover and the details card.
// Same shape as the Cover resolver: pure apart from the injected fetch.
import type { CoverQuery, Fetcher } from './covers'
import { cleanTitle, getJson, normalizeIsbn } from './covers'

export type DescriptionSource = 'apple-isbn' | 'openlibrary-isbn' | 'google-books' | 'apple-search' | 'openlibrary-search'

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
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** (Google)
    .replace(/^\s*From (?:the )?(?:inside |front |back )?(?:cover|flap|jacket)[^:\n]{0,80}:\s*/i, '') // "From inside cover Tor First Edition March 1999:"
    .split(/\n-{3,}\s*\n/)[0]! // Open Library appends "----------" + source/also-contained lists
    .replace(/\(\[[^\]]*\]\[\d+\]\)/g, '') // ([source][1])
    .replace(/\[([^\]]+)\]\[\d+\]/g, '$1') // [text][1]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .replace(/^\s*\[\d+\]:.*$/gm, '') // [1]: https://…
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // Publisher copy often opens with review quotes ("…" —Name) and edition notes; the story starts after them.
  const paragraphs = text.split(/\n\n+/)
  while (paragraphs.length > 1 && /^["“'‘[]/.test(paragraphs[0]!) && /\s[—–]\s?\S/.test(paragraphs[0]!)) paragraphs.shift()
  text = paragraphs.join('\n\n')
    .replace(/^Now (?:available )?in (?:mass[- ]market |trade )?(?:paperback|hardcover)[,:.!]?\s*/i, '')
    .replace(/^\p{Ll}/u, letter => letter.toUpperCase())
  if (text.length > MAX_DESCRIPTION) {
    const cut = text.slice(0, MAX_DESCRIPTION)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
    text = end > MAX_DESCRIPTION * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
  }
  return text
}

interface AppleBook { trackName?: string, artistName?: string, description?: string }

const APPLE_COUNTRIES = ['us', 'gb']
/** Letters and digits only, for loose title comparison. */
const comparable = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

/** Apple Books by ISBN: the publisher's blurb, in English from the US/UK stores. */
async function fromAppleIsbn(query: CoverQuery, options: DescriptionOptions): Promise<string> {
  for (const isbn of [normalizeIsbn(query.isbn13), normalizeIsbn(query.isbn10)]) {
    if (!isbn) continue
    for (const country of APPLE_COUNTRIES) {
      const result = await getJson<{ results?: AppleBook[] }>(`https://itunes.apple.com/lookup?isbn=${isbn}&country=${country}`, options)
      const text = result?.results?.[0]?.description
      if (text) return text
    }
  }
  return ''
}

/**
 * Apple Books by title + author, for editions Apple doesn't list by ISBN.
 * Only accepts a result whose title matches and whose author shares the surname.
 */
export async function fromAppleSearch(query: CoverQuery, options: DescriptionOptions): Promise<string> {
  const title = cleanTitle(query.title)
  if (!title) return ''
  const author = query.author?.trim() ?? ''
  const surname = comparable(author.split(/\s+/).at(-1) ?? '')
  const params = new URLSearchParams({ term: `${title} ${author}`.trim(), entity: 'ebook', country: 'us', limit: '5' })
  const result = await getJson<{ results?: AppleBook[] }>(`https://itunes.apple.com/search?${params}`, options)
  const wanted = comparable(title)
  const match = result?.results?.find(item =>
    item.description
    && comparable(cleanTitle(item.trackName)).startsWith(wanted)
    && (!surname || comparable(item.artistName ?? '').includes(surname)),
  )
  return match?.description ?? ''
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

/**
 * Publisher text first (Apple Books is English and close to the printed
 * back), then Open Library and Google by ISBN, then title searches.
 */
const SOURCES: [DescriptionSource, (query: CoverQuery, options: DescriptionOptions) => Promise<string>][] = [
  ['apple-isbn', fromAppleIsbn],
  ['openlibrary-isbn', fromOpenLibraryIsbn],
  ['google-books', fromGoogleBooks],
  ['apple-search', fromAppleSearch],
  ['openlibrary-search', fromOpenLibrarySearch],
]

export type Language = 'en' | 'de' | 'fr' | 'es' | 'it'

/** The edition's language from its ISBN registration group, when the group is a language one. */
export function isbnLanguage(isbn13: string | null | undefined): Language | null {
  const isbn = normalizeIsbn(isbn13)
  if (/^97[89][01]/.test(isbn)) return 'en'
  if (/^9783/.test(isbn)) return 'de'
  if (/^9782/.test(isbn)) return 'fr'
  if (/^97884/.test(isbn)) return 'es'
  if (/^97888/.test(isbn)) return 'it'
  return null
}

const STOPWORDS: Record<Language, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'his', 'her', 'with', 'that', 'was'],
  de: ['der', 'die', 'und', 'das', 'ist', 'nicht', 'mit', 'sich', 'ein', 'eine'],
  fr: ['le', 'la', 'les', 'et', 'est', 'une', 'des', 'du', 'dans', 'qui'],
  es: ['el', 'los', 'las', 'y', 'es', 'una', 'del', 'por', 'con', 'que'],
  it: ['il', 'gli', 'della', 'e', 'che', 'una', 'del', 'per', 'con', 'non'],
}

/** Rough language of a text by stopword counts; null when too short to tell. */
export function guessLanguage(text: string): Language | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 12) return null
  let best: Language | null = null
  let bestCount = 0
  for (const [language, list] of Object.entries(STOPWORDS) as [Language, string[]][]) {
    const set = new Set(list)
    const count = words.filter(word => set.has(word)).length
    if (count > bestCount) {
      best = language
      bestCount = count
    }
  }
  return bestCount >= 3 ? best : null
}

export async function resolveDescription(query: CoverQuery, options: DescriptionOptions): Promise<ResolvedDescription | null> {
  const expected = isbnLanguage(query.isbn13)
  for (const [source, lookup] of SOURCES) {
    const description = cleanDescription(await lookup(query, options))
    if (!description) continue
    // A blurb in another language than the edition (Open Library mixes translations into a work) is skipped.
    const language = guessLanguage(description)
    if (expected && language && language !== expected) continue
    return { description, source }
  }
  return null
}
