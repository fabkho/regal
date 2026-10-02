import { computed } from 'vue'
import type { ImportLibraryResult } from '#layers/regal/shared/library/importLibrary'
import { NotAReadingTrackerExportError } from '#layers/regal/shared/library/importReadingTracker'
import type { Book } from '#layers/regal/shared/types/book'

/** localStorage key. Bump the version below if the stored shape ever changes incompatibly. */
export const LIBRARY_STORAGE_KEY = 'regal:library:v1'
export const LIBRARY_STORAGE_VERSION = 1

export interface StoredLibrary {
  version: number
  books: Book[]
}

export interface LibrarySummary {
  total: number
  /** Book count per Reading status, keyed by the raw status string. */
  counts: Record<string, number>
}

function booksState() {
  // useState: per-request on the server, shared across components on the
  // client. No module-scope reactive state, so nothing leaks between SSR
  // requests and nothing reads localStorage before hydration.
  return useState<Book[]>('library:books', () => [])
}

function warningsState() {
  return useState<string[]>('library:warnings', () => [])
}

function errorState() {
  return useState<string | null>('library:error', () => null)
}

/**
 * True once the client has attempted to restore a Library from localStorage
 * after hydration. Useful for UI that wants to avoid flashing the empty
 * state before restore completes.
 */
export function useLibraryRestored() {
  return useState<boolean>('library:restored', () => false)
}

/**
 * The CSV importer (Papa Parse) and the demo CSVs load on demand, in the
 * browser: kept out of server bundles, where some builds (e.g. a Nuxt host on
 * Cloudflare) rewrite the `typeof window` inside Papa Parse's worker string
 * into invalid code. JSON exports parse without it.
 */
const browserOnly = () => Promise.reject(new Error('CSV libraries load in the browser only.'))
const csvImporter = () => import.meta.server
  ? browserOnly()
  : import('#layers/regal/shared/library/importLibrary')

async function parseLibraryText(text: string): Promise<ImportLibraryResult> {
  return (await csvImporter()).importLibrary(text)
}

/**
 * Reactive Library store, shared across every component that calls it.
 * Persisted to `localStorage` under `regal:library:v1` by the
 * `library-persistence.client` plugin, which restores it after hydration
 * to avoid SSR/client hydration mismatches.
 */
export function useLibrary() {
  const books = booksState()
  const warnings = warningsState()
  const error = errorState()

  const summary = computed<LibrarySummary>(() => {
    const counts: Record<string, number> = {}
    for (const book of books.value) {
      counts[book.status] = (counts[book.status] ?? 0) + 1
    }
    return { total: books.value.length, counts }
  })

  function applyResult(result: { books: Book[], warnings: string[] }) {
    books.value = result.books
    warnings.value = result.warnings
    error.value = null
  }

  async function importFile(file: File) {
    const { importLibrary, NotAGoodreadsExportError } = await csvImporter()
    try {
      const text = await file.text()
      const result = importLibrary(text)
      applyResult(result)
    }
    catch (caught) {
      warnings.value = []
      if (caught instanceof NotAGoodreadsExportError) {
        error.value = 'That doesn\'t look like a Goodreads library export CSV. Export it from Goodreads → My Books → Import and export → Export Library.'
      }
      else if (caught instanceof NotAReadingTrackerExportError) {
        error.value = 'That JSON isn\'t a reading-tracker export. Create one with `reading list --json > library.json`.'
      }
      else {
        error.value = 'Could not read that file. Please try again.'
      }
    }
  }

  /** 'classics' is the public Demo library; 'sun-eater' is a dev test Library (one series, one design). */
  async function loadDemo(name: 'classics' | 'sun-eater' = 'classics') {
    try {
      if (import.meta.server) await browserOnly()
      const csv = name === 'sun-eater'
        ? await import('#layers/regal/app/assets/data/sun-eater.csv?raw')
        : await import('#layers/regal/app/assets/data/demo-library.csv?raw')
      const result = await parseLibraryText(csv.default)
      applyResult(result)
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not load the demo library.'
    }
  }

  /** Loads a Library export from a URL (dev: the asset pipeline's /book-assets/library.json). */
  async function loadUrl(url: string) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${url}: ${response.status}`)
      applyResult(await parseLibraryText(await response.text()))
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not load that library.'
    }
  }

  function clear() {
    books.value = []
    warnings.value = []
    error.value = null
  }

  return {
    books,
    summary,
    warnings,
    error,
    importFile,
    loadDemo,
    loadUrl,
    clear,
  }
}
