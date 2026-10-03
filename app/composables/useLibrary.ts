import { computed } from 'vue'
import type { Book } from '#layers/regal/shared/types/book'
import { assetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import type { AssetFaces, BookAssetEntry } from '#layers/regal/app/utils/covers/bookAssets'
import { resolveLibraryUrl } from '#layers/regal/app/utils/library/libraryFile'
import type { LibraryLoadError, LoadedLibrary } from '#layers/regal/app/utils/library/libraryFile'

export interface LibrarySummary {
  total: number
  /** Book count per Reading status, keyed by the raw status string. */
  counts: Record<string, number>
}

/** Where the shown Library came from. */
export interface LibrarySource {
  /** The library file's URL as configured (may be relative to the page). */
  src: string
  /** Whose Library it is, when the file says. */
  owner: string | null
}

/**
 * The Library shown, shared across every component that calls it: the Books,
 * their faces and where they came from, or why there are none. Filled from a
 * Regal library file by useRegalLibrary. useState: per request on the server
 * (no module-scope state shared between requests), then in the page payload.
 */
export function useLibrary() {
  const books = useState<Book[]>('library:books', () => [])
  const assets = useState<Record<string, BookAssetEntry>>('library:assets', () => ({}))
  const source = useState<LibrarySource | null>('library:source', () => null)
  const error = useState<LibraryLoadError | null>('library:error', () => null)

  const summary = computed<LibrarySummary>(() => {
    const counts: Record<string, number> = {}
    for (const book of books.value) {
      counts[book.status] = (counts[book.status] ?? 0) + 1
    }
    return { total: books.value.length, counts }
  })

  /** Shows a Library read from the file at `src`. */
  function show(library: LoadedLibrary, src: string) {
    books.value = library.books
    assets.value = library.assets
    source.value = { src, owner: library.owner }
    error.value = null
  }

  /** Shows why there is no Library: never an empty shelf without a word. */
  function fail(reason: LibraryLoadError, src: string | null) {
    books.value = []
    assets.value = {}
    source.value = src ? { src, owner: null } : null
    error.value = reason
  }

  /**
   * A Book's faces with their URLs resolved against the library file's, in
   * the browser (where the images load); null when the file has none for it.
   */
  function facesOf(bookId: string): AssetFaces | null {
    const entry = assets.value[bookId]
    const src = source.value?.src
    if (!entry || !src || !import.meta.client) return null
    const page = window.location.href
    return assetFaces(entry, reference => resolveLibraryUrl(reference, src, page))
  }

  return { books, assets, source, error, summary, show, fail, facesOf }
}
