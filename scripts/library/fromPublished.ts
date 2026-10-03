// Converter: today's published data (the reading-tracker JSON `library.json`
// plus the asset `manifest.json`, see the README's "Static data") → one Regal
// library file (docs/library-file.md). Pure; the CLI is convert.ts.
//
// It reads both the way the display does today, so the converted file shows
// the same Library: Books through importReadingTracker, the manifest entry by
// ISBN-13 first and the Book id second, colours only when they are #rrggbb,
// the manifest's cleaned blurb before the tracker's.
import { importReadingTracker } from './importReadingTracker'
import type { ReadingTrackerBook } from './importReadingTracker'
import type { Book } from '../../shared/types/book'
import { LIBRARY_FILE_VERSION } from '../../shared/types/libraryFile'
import type { LibraryBook, LibraryBookAssets, LibraryBookFace, LibraryQuote, RegalLibraryFile } from '../../shared/types/libraryFile'

/** A manifest.json entry, as the asset build (frozen on `main`) writes it (paths relative to the assets base). */
export interface ManifestEntry {
  front?: string
  spine?: string
  back?: string
  pile?: { front?: string, spine?: string }
  palette?: { background?: string, text?: string, accent?: string }
  spineColor?: string
  source?: string
  photoFaces?: string[]
  description?: string
  quotes?: { text?: string, source?: string }[]
  genre?: string
  publisher?: string
  meta?: Record<string, unknown>
}

export type Manifest = Record<string, ManifestEntry>

export interface ConvertOptions {
  /** Text of the reading-tracker export (`{ books: [...] }`). */
  libraryText: string
  manifest?: Manifest | null
  /**
   * Prefix for the manifest's relative paths: an absolute URL, or a path
   * relative to where the library file will live. Without it the paths stay
   * as they are (the file sits next to manifest.json).
   */
  assetsBase?: string
  /** ISO 8601 date-time. */
  generatedAt: string
  owner?: string | null
  generator?: string
}

export interface ConvertStats {
  books: number
  /** Books with at least one image (front, Spine, back or a pile copy). */
  withAssets: number
  withFront: number
  withSpine: number
  withBack: number
  withPile: number
  withPalette: number
  /** Books with no manifest front whose front is the tracker's coverUrl. */
  coverFallbacks: number
  /** Manifest entries no Book uses. */
  unusedManifestEntries: number
}

export interface ConvertResult {
  library: RegalLibraryFile
  warnings: string[]
  stats: ConvertStats
}

const FACES: LibraryBookFace[] = ['front', 'spine', 'back']
const HEX = /^#[\da-f]{6}$/i
const HTTP = /^https?:\/\//i
const DATE = /^\d{4}-\d{2}-\d{2}/

/** Drops null, undefined and empty objects: the file leaves out what's unknown. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null
    && !(typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length))) as T
}

const nonEmpty = <T>(items: T[]) => (items.length ? items : null)

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const hex = (value: unknown) => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null)

/** The manifest entry the display picks for a Book: ISBN-13 first, then the Book id. */
export function manifestKeyFor(book: Pick<Book, 'id' | 'isbn13'>, manifest: Manifest): string | null {
  const isbn = book.isbn13?.replace(/\D/g, '')
  if (isbn && manifest[isbn]) return isbn
  return manifest[book.id] ? book.id : null
}

/** A manifest path as a library file reference (absolute and root paths stay). */
export function assetReference(path: string, assetsBase?: string): string {
  if (!assetsBase || /^(?:https?:)?\//i.test(path)) return path
  return `${assetsBase.endsWith('/') ? assetsBase : `${assetsBase}/`}${path}`
}

function assetsOf(entry: ManifestEntry, url: (path: string) => string, warn: (message: string) => void): LibraryBookAssets {
  const image = (path: unknown) => (text(path) ? url(text(path)!) : null)
  const [background, textColour, accent] = [entry.palette?.background, entry.palette?.text, entry.palette?.accent].map(hex)
  if (entry.palette && !(background && textColour && accent)) warn('palette dropped (not three #rrggbb colours)')
  if (entry.spineColor && !hex(entry.spineColor)) warn(`spineColor dropped (${JSON.stringify(entry.spineColor)} is not #rrggbb)`)
  const photoFaces = (entry.photoFaces ?? []).filter((face): face is LibraryBookFace => FACES.includes(face as LibraryBookFace))
  return compact<LibraryBookAssets>({
    front: image(entry.front),
    spine: image(entry.spine),
    back: image(entry.back),
    pile: compact({ front: image(entry.pile?.front), spine: image(entry.pile?.spine) }),
    palette: background && textColour && accent ? { background, text: textColour, accent } : null,
    spineColor: hex(entry.spineColor),
    photoFaces: nonEmpty(photoFaces),
    source: entry.source === 'photo' || entry.source === 'ai' ? entry.source : null,
  })
}

function quotesOf(entry: ManifestEntry | undefined): LibraryQuote[] {
  return (entry?.quotes ?? [])
    .filter(quote => text(quote?.text))
    .map(quote => ({ text: text(quote.text)!, source: text(quote.source) ?? '' }))
}

/** Converts today's published data into a Regal library file. */
export function convertPublished(options: ConvertOptions): ConvertResult {
  const { books, warnings } = importReadingTracker(options.libraryText)
  const raw = JSON.parse(options.libraryText.replace(/^\uFEFF/, '')) as { books?: Partial<ReadingTrackerBook>[] } | Partial<ReadingTrackerBook>[]
  const rawById = new Map((Array.isArray(raw) ? raw : raw.books ?? []).map(entry => [entry?.id, entry]))
  const manifest = options.manifest ?? {}
  const url = (path: string) => assetReference(path, options.assetsBase)
  const used = new Set<string>()
  const stats: ConvertStats = { books: 0, withAssets: 0, withFront: 0, withSpine: 0, withBack: 0, withPile: 0, withPalette: 0, coverFallbacks: 0, unusedManifestEntries: 0 }

  const libraryBooks = books.map((book): LibraryBook => {
    const key = manifestKeyFor(book, manifest)
    const entry = key ? manifest[key] : undefined
    if (key) used.add(key)
    const assets: LibraryBookAssets = entry ? assetsOf(entry, url, message => warnings.push(`${book.title} (${key}): ${message}`)) : {}
    // No asset front: the tracker's own Cover, as the display has no Cover resolver any more.
    if (!assets.front && book.coverUrl && HTTP.test(book.coverUrl)) {
      assets.front = book.coverUrl
      stats.coverFallbacks++
    }
    const started = rawById.get(book.id)?.session?.startedAt
    const result = compact<LibraryBook>({
      id: book.id,
      title: book.title,
      seriesTitle: book.seriesTitle,
      authors: [book.author, ...book.additionalAuthors].filter((name): name is string => Boolean(name)),
      isbn13: book.isbn13,
      isbn10: book.isbn10,
      pages: book.pages,
      binding: book.binding,
      yearPublished: book.yearPublished,
      originalYear: book.originalYear,
      status: book.status,
      dateRead: book.dateRead,
      dateStarted: typeof started === 'string' && DATE.test(started) ? started.slice(0, 10) : null,
      dateAdded: book.dateAdded,
      rating: book.rating,
      review: book.review,
      reviewHasSpoiler: book.reviewHasSpoiler,
      readCount: book.readCount,
      description: text(entry?.description) ?? text(book.description),
      publisher: text(entry?.publisher),
      genre: text(entry?.genre),
      quotes: nonEmpty(quotesOf(entry)),
      assets: compact(assets),
    })

    stats.books++
    const images = result.assets ?? {}
    if (images.front || images.spine || images.back || images.pile) stats.withAssets++
    if (images.front) stats.withFront++
    if (images.spine) stats.withSpine++
    if (images.back) stats.withBack++
    if (images.pile) stats.withPile++
    if (images.palette) stats.withPalette++
    return result
  })
  stats.unusedManifestEntries = Object.keys(manifest).filter(key => !used.has(key)).length

  const library = compact<RegalLibraryFile>({
    version: LIBRARY_FILE_VERSION,
    generatedAt: options.generatedAt,
    owner: text(options.owner),
    generator: options.generator ?? 'regal library:convert',
    books: libraryBooks,
  })
  return { library, warnings, stats }
}
