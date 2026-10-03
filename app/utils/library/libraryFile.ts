// Reading a Regal library file (docs/library-file.md) into what the display
// keeps: the Books, each Book's faces and the file's few top-level facts. Pure,
// so it runs on the server (the records are in the HTML) and in the browser.
import { formatLibraryFileErrors, libraryBookToBook, parseLibraryFile } from '#layers/regal/shared/library/libraryFile'
import type { Book } from '#layers/regal/shared/types/book'
import type { LibraryBook } from '#layers/regal/shared/types/libraryFile'
import type { BookAssetEntry } from '#layers/regal/app/utils/covers/bookAssets'

export interface LoadedLibrary {
  books: Book[]
  /** Faces per Book id; image references as in the file (see resolveLibraryUrl). */
  assets: Record<string, BookAssetEntry>
  /** Whose Library it is, when the file says. */
  owner: string | null
}

/** Why a library file can't be shown. */
export interface LibraryLoadError {
  /** One line: what went wrong. */
  message: string
  /** The first problems, e.g. `books[2].rating: must be …`. */
  details: string[]
  /** How many more problems there are than `details` lists. */
  more: number
}

/** How many validation errors the error state lists. */
export const SHOWN_ERRORS = 5

export type LibraryReadResult = { ok: true, library: LoadedLibrary } | { ok: false, error: LibraryLoadError }

const defined = <T>(value: T | null | undefined): T | undefined => value ?? undefined

/** A Book's faces and back-cover extras, nulls left out; undefined when it has none. */
export function assetEntryOf(book: LibraryBook): BookAssetEntry | undefined {
  const assets = book.assets
  const entry: BookAssetEntry = {
    front: defined(assets?.front),
    spine: defined(assets?.spine),
    back: defined(assets?.back),
    source: defined(assets?.source),
    pile: assets?.pile?.front || assets?.pile?.spine ? { front: defined(assets.pile.front), spine: defined(assets.pile.spine) } : undefined,
    palette: defined(assets?.palette),
    spineColor: defined(assets?.spineColor),
    photoFaces: assets?.photoFaces?.length ? [...assets.photoFaces] : undefined,
    quotes: book.quotes?.length ? book.quotes.map(({ text, source }) => ({ text, source })) : undefined,
    genre: defined(book.genre),
    publisher: defined(book.publisher),
  }
  // Only what is set: the entries travel in the page payload.
  const set = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as BookAssetEntry
  return Object.keys(set).length ? set : undefined
}

/** Validation errors as the error state shows them: the first few, then a count. */
export function invalidFileError(errors: { path: string, reason: string }[]): LibraryLoadError {
  // The validator ends a long list with a `…and N more error(s)` line of its own.
  const last = errors.at(-1)
  const dropped = last && last.path === '' ? Number(/^…and (\d+) more/.exec(last.reason)?.[1] ?? Number.NaN) : Number.NaN
  const listed = Number.isNaN(dropped) ? errors : errors.slice(0, -1)
  const details = formatLibraryFileErrors(listed.slice(0, SHOWN_ERRORS))
  const more = Math.max(0, listed.length - SHOWN_ERRORS) + (Number.isNaN(dropped) ? 0 : dropped)
  return { message: 'This is not a valid Regal library file.', details, more }
}

/** Parses and validates the text of a library file. */
export function readLibraryFile(text: string): LibraryReadResult {
  const result = parseLibraryFile(text)
  if (!result.ok) return { ok: false, error: invalidFileError(result.errors) }
  const assets: Record<string, BookAssetEntry> = {}
  for (const book of result.library.books) {
    const entry = assetEntryOf(book)
    if (entry) assets[book.id] = entry
  }
  return {
    ok: true,
    library: {
      books: result.library.books.map(libraryBookToBook),
      assets,
      owner: result.library.owner?.trim() || null,
    },
  }
}

/** The file couldn't be fetched (network, 404, CORS). */
export function unreachableFileError(src: string, cause: unknown): LibraryLoadError {
  const reason = cause instanceof Error ? cause.message : String(cause)
  return { message: 'Could not load the library file.', details: [shortened(`${src}: ${reason}`)], more: 0 }
}

/** A line kept readable: a `data:` URL can be kilobytes long. */
export const shortened = (line: string, max = 200) => (line.length > max ? `${line.slice(0, max - 1)}…` : line)

/** No `librarySrc` configured. */
export const NO_SOURCE_ERROR: LibraryLoadError = {
  message: 'No library file to show.',
  details: ['Set runtimeConfig.public.regal.librarySrc (NUXT_PUBLIC_REGAL_LIBRARY_SRC) to the URL of a Regal library file.'],
  more: 0,
}

/**
 * Resolves an image reference of the file like a link in a page at the file's
 * address: `src` (the file's URL as configured) is resolved against `page`
 * first. Null for anything but http(s) (the validator lets no other through).
 */
export function resolveLibraryUrl(reference: string, src: string, page: string): string | null {
  try {
    const url = new URL(reference, new URL(src, page))
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  }
  catch {
    return null
  }
}
