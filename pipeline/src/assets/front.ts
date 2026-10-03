// High-res front Cover + publisher blurb for a Book (#19 in script form).
// Apple Books first (2000–3000 px, publisher copy), then Google's cover
// endpoint by ISBN (up to 2000 px, no key), then the Book's own cover (the
// library file's front, `coverUrl` here), then Open Library. Books without an
// ISBN get candidate ISBNs from an Open Library title search, filtered to the
// edition's language. Rejects placeholders and small images.
//
// Language-aware: a Book read in German is looked up in Apple's German
// storefront, and the German National Library's cover service (the exact
// edition by ISBN, ~600 px) comes before any title search, so a German read
// never gets the English cover.
import sharp from 'sharp'
import type { Book } from '../layer'
import { cleanTitle, USER_AGENT } from '../resolvers/covers'
import { isbnLanguage } from '../resolvers/descriptions'
import { toIsbn13 } from '../isbn'

export interface FrontResult {
  image: Buffer
  width: number
  height: number
  source: string
  url: string
  /** Apple's description for the same edition, when found there. */
  appleDescription: string | null
  /** Apple's genre list for the edition ("Sci-Fi & Fantasy", "Books", …). */
  appleGenres: string[]
}

export interface AppleBook { trackName?: string, artistName?: string, artworkUrl100?: string, description?: string, genres?: string[], userRatingCount?: number }

/** An Apple hit and how it was found: the exact edition (ISBN) or a title search. */
export type AppleHit = AppleBook & { via: 'isbn' | 'search' }

export interface FrontOptions {
  /** Language the Book was read in (default: its ISBN's, else English). */
  language?: string
  /** A cover the owner chose: tried first, whatever its size. */
  pinnedUrl?: string | null
}

export const MIN_HEIGHT = 800
const comparable = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

/** Google's "image not available" card (128×184) and other thumbnails too small to be a cover. */
export function isPlaceholder(width: number, height: number): boolean {
  return height <= 200 || width < 100 || (width === 128 && height === 184)
}

/** Apple storefronts for a language: German reads in the German store, English ones in the US, then the UK. */
export const storefronts = (language: string) => (language === 'de' ? ['de'] : ['us', 'gb'])

/**
 * Comparable cores of a title: brackets (series, edition notes) and
 * ": subtitles" dropped, a leading article and "A Novel" too.
 */
export function titleCores(title: string | undefined): string[] {
  const bare = (title ?? '').replace(/\s*[([][^()[\]]*[)\]]/g, ' ').replace(/[:–—-]\s*a novel\s*$/i, '').trim()
  const main = bare.split(/:|\s[–—]\s/)[0]!.trim()
  const cores = [bare, main].map(comparable)
  for (const core of [...cores]) {
    const bareArticle = core.replace(/^(the|a|an|der|die|das)(?=[a-z0-9]{3})/, '')
    if (bareArticle !== core) cores.push(bareArticle)
  }
  return [...new Set(cores.filter(Boolean))]
}

/**
 * 2 = same title, 1 = theirs is ours plus more (a subtitle or series only they
 * carry), 0 = different. Not the other way round: "The Ember Trilogy" is
 * not "Ember".
 */
export function titleScore(found: string | undefined, wanted: string): number {
  const ours = titleCores(wanted)
  const theirs = titleCores(found)
  if (ours.some(core => theirs.includes(core))) return 2
  return ours.some(core => core.length >= 6 && theirs.some(other => other.startsWith(core))) ? 1 : 0
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    return response.ok ? await response.json() as T : null
  }
  catch {
    return null
  }
}

async function image(url: string): Promise<{ image: Buffer, width: number, height: number } | null> {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return null
    return { image: buffer, width: meta.width, height: meta.height }
  }
  catch {
    return null
  }
}

const languageOf = (book: Book, options: FrontOptions) => options.language ?? isbnLanguage(book.isbn13) ?? 'en'

/**
 * Apple Books in the read language's storefronts: ISBN lookup (the exact
 * edition), then a title + author search that accepts a subtitle or series on
 * either side (omnibus and UK titles, novellas), the closest title and the
 * most-rated edition first.
 */
export async function findApple(book: Book, options: FrontOptions = {}): Promise<AppleHit | null> {
  const countries = storefronts(languageOf(book, options))
  const isbns = [...new Set([book.isbn13, toIsbn13(book.isbn10), book.isbn10].filter((isbn): isbn is string => Boolean(isbn)))]
  for (const isbn of isbns) {
    for (const country of countries) {
      const result = await json<{ results?: AppleBook[] }>(`https://itunes.apple.com/lookup?isbn=${isbn}&country=${country}`)
      if (result?.results?.[0]?.artworkUrl100) return { ...result.results[0], via: 'isbn' }
    }
  }
  const surnames = [book.author, ...book.additionalAuthors].map(name => comparable(name?.split(/\s+/).at(-1) ?? '')).filter(Boolean)
  const terms = [...new Set([cleanTitle(book.title), book.title.split(':')[0]!.trim()])]
  for (const country of countries) {
    for (const term of terms) {
      const params = new URLSearchParams({ term: `${term} ${book.author ?? ''}`.trim(), entity: 'ebook', country, limit: '10' })
      const result = await json<{ results?: AppleBook[] }>(`https://itunes.apple.com/search?${params}`)
      const scored = (result?.results ?? [])
        .filter(item => item.artworkUrl100 && (!surnames.length || surnames.some(name => comparable(item.artistName ?? '').includes(name))))
        .map(item => ({ item, score: titleScore(item.trackName, book.title) }))
        .filter(hit => hit.score > 0)
      // The closest title; among equals the edition most readers rated (a classic has dozens of bare reprints).
      const best = scored.sort((a, b) => b.score - a.score || (b.item.userRatingCount ?? 0) - (a.item.userRatingCount ?? 0))[0]
      if (best) return { ...best.item, via: 'search' }
    }
  }
  return null
}

/** ISBN-13s of other editions (Open Library search), same language as the Book's (English if unknown). */
export async function discoverIsbns(book: Book, limit = 4, language?: string): Promise<string[]> {
  const params = new URLSearchParams({ title: cleanTitle(book.title), fields: 'isbn', limit: '5' })
  if (book.author) params.set('author', book.author)
  const result = await json<{ docs?: { isbn?: string[] }[] }>(`https://openlibrary.org/search.json?${params}`)
  const wanted = language ?? isbnLanguage(book.isbn13) ?? 'en'
  const isbns = (result?.docs ?? []).flatMap(doc => doc.isbn ?? []).filter(isbn => isbn.length === 13 && isbnLanguage(isbn) === wanted)
  return [...new Set(isbns)].slice(0, limit)
}

/** The work's own cover on Open Library (title search), for omnibus editions no store sells any more. */
export async function openLibraryWorkCover(book: Book): Promise<string | null> {
  const params = new URLSearchParams({ title: cleanTitle(book.title), fields: 'title,cover_i', limit: '5' })
  if (book.author) params.set('author', book.author)
  const result = await json<{ docs?: { title?: string, cover_i?: number }[] }>(`https://openlibrary.org/search.json?${params}`)
  const doc = result?.docs?.find(item => item.cover_i && titleScore(item.title, book.title) === 2)
  return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null
}

const googleCover = (isbn: string) => `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1&fife=h2000`
/** Deutsche Nationalbibliothek / VLB cover of exactly this (German) edition, ~600 px. */
const dnbCover = (isbn: string) => `https://portal.dnb.de/opac/mvb/cover?isbn=${isbn}`
const appleArtwork = (apple: AppleBook) => apple.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/10000x10000bb.jpg')

interface Candidate { source: string, url: string, minHeight?: number }

/**
 * The best front: the first candidate at least `minHeight` tall (800 px; an
 * exact German edition from the DNB 500), else the tallest real one.
 */
export async function resolveFront(book: Book, options: FrontOptions = {}): Promise<FrontResult | null> {
  const language = languageOf(book, options)
  const apple = await findApple(book, { ...options, language })
  const known = [...new Set([book.isbn13, toIsbn13(book.isbn10), book.isbn10].filter((isbn): isbn is string => Boolean(isbn)))]
  const candidates: Candidate[] = []
  if (options.pinnedUrl) candidates.push({ source: 'pinned', url: options.pinnedUrl, minHeight: 0 })
  if (apple?.via === 'isbn') candidates.push({ source: 'apple', url: appleArtwork(apple) })
  if (language === 'de') {
    for (const isbn of known.filter(isbn => isbnLanguage(isbn) === 'de')) candidates.push({ source: 'dnb', url: dnbCover(isbn), minHeight: 500 })
  }
  if (apple?.via === 'search') candidates.push({ source: 'apple', url: appleArtwork(apple) })
  for (const isbn of known) candidates.push({ source: 'google', url: googleCover(isbn) })
  if (!known.length) {
    for (const isbn of await discoverIsbns(book, 4, language)) candidates.push({ source: `google (ISBN ${isbn} via Open Library)`, url: googleCover(isbn) })
  }
  if (book.coverUrl && book.coverUrl !== options.pinnedUrl) candidates.push({ source: 'input', url: book.coverUrl })
  for (const isbn of known) candidates.push({ source: 'openlibrary', url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` })

  let best: FrontResult | null = null
  const consider = async (candidate: Candidate) => {
    const found = await image(candidate.url)
    if (!found || isPlaceholder(found.width, found.height)) return false
    const result = { ...found, source: candidate.source, url: candidate.url, appleDescription: apple?.description ?? null, appleGenres: apple?.genres ?? [] }
    if (!best || found.height > best.height) best = result
    return found.height >= (candidate.minHeight ?? MIN_HEIGHT)
  }
  for (const candidate of candidates) {
    if (await consider(candidate)) return best
  }
  // Nothing anywhere by ISBN (an out-of-print omnibus): the work's cover on Open Library.
  if (!best) {
    const url = await openLibraryWorkCover(book)
    if (url) await consider({ source: 'openlibrary (work)', url })
  }
  return best
}
