// High-res front Cover + publisher blurb for a Book (#19 in script form).
// Apple Books first (2000–3000 px, publisher copy), then Google's cover
// endpoint by ISBN (up to 2000 px, no key), then the source's own cover
// (Fable), then Open Library. Books without an ISBN (Fable sometimes has
// none) get candidate ISBNs from an Open Library title search, filtered to
// the edition's language. Rejects placeholders and small images.
import sharp from 'sharp'
import type { Book } from '../../shared/types/book'
import { cleanTitle, USER_AGENT } from '../../server/utils/covers'
import { isbnLanguage } from '../../server/utils/descriptions'

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

export interface AppleBook { trackName?: string, artistName?: string, artworkUrl100?: string, description?: string, genres?: string[] }

const MIN_HEIGHT = 800
const comparable = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

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

/** Apple Books: ISBN lookup (US, UK), then title + author search with a match check. */
export async function findApple(book: Book): Promise<AppleBook | null> {
  for (const isbn of [book.isbn13, book.isbn10]) {
    if (!isbn) continue
    for (const country of ['us', 'gb']) {
      const result = await json<{ results?: AppleBook[] }>(`https://itunes.apple.com/lookup?isbn=${isbn}&country=${country}`)
      if (result?.results?.[0]?.artworkUrl100) return result.results[0]
    }
  }
  const title = cleanTitle(book.title)
  const surname = comparable(book.author?.split(/\s+/).at(-1) ?? '')
  const params = new URLSearchParams({ term: `${title} ${book.author ?? ''}`.trim(), entity: 'ebook', country: 'us', limit: '8' })
  const result = await json<{ results?: AppleBook[] }>(`https://itunes.apple.com/search?${params}`)
  return result?.results?.find(item =>
    item.artworkUrl100
    && comparable(cleanTitle(item.trackName)).startsWith(comparable(title))
    && (!surname || comparable(item.artistName ?? '').includes(surname)),
  ) ?? null
}

/** ISBN-13s of other editions (Open Library search), same language as the Book's (English if unknown). */
export async function discoverIsbns(book: Book, limit = 4): Promise<string[]> {
  const params = new URLSearchParams({ title: cleanTitle(book.title), fields: 'isbn', limit: '5' })
  if (book.author) params.set('author', book.author)
  const result = await json<{ docs?: { isbn?: string[] }[] }>(`https://openlibrary.org/search.json?${params}`)
  const language = isbnLanguage(book.isbn13) ?? 'en'
  const isbns = (result?.docs ?? []).flatMap(doc => doc.isbn ?? []).filter(isbn => isbn.length === 13 && isbnLanguage(isbn) === language)
  return [...new Set(isbns)].slice(0, limit)
}

const googleCover = (isbn: string) => `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1&fife=h2000`

export async function resolveFront(book: Book): Promise<FrontResult | null> {
  const apple = await findApple(book)
  const known = [book.isbn13, book.isbn10].filter((isbn): isbn is string => Boolean(isbn))
  const candidates: { source: string, url: string }[] = []
  if (apple?.artworkUrl100) candidates.push({ source: 'apple', url: apple.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/10000x10000bb.jpg') })
  for (const isbn of known) candidates.push({ source: 'google', url: googleCover(isbn) })
  if (!known.length) {
    for (const isbn of await discoverIsbns(book)) candidates.push({ source: `google (ISBN ${isbn} via Open Library)`, url: googleCover(isbn) })
  }
  if (book.coverUrl) candidates.push({ source: 'fable', url: book.coverUrl })
  for (const isbn of known) candidates.push({ source: 'openlibrary', url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` })

  let best: FrontResult | null = null
  for (const candidate of candidates) {
    const found = await image(candidate.url)
    if (!found || found.width < 100) continue
    const result = { ...found, ...candidate, appleDescription: apple?.description ?? null, appleGenres: apple?.genres ?? [] }
    if (found.height >= MIN_HEIGHT) return result
    if (!best || found.height > best.height) best = result
  }
  return best
}
