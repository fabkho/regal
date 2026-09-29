import { computed, ref } from 'vue'
import demoLibraryCsv from '~/assets/data/demo-library.csv?raw'
import { importLibrary, NotAGoodreadsExportError } from '#shared/library/importLibrary'
import type { Book } from '#shared/types/book'

/** Bump this if the stored shape ever changes incompatibly. */
const STORAGE_KEY = 'bookshelf:library:v1'
const STORAGE_VERSION = 1

interface StoredLibrary {
  version: number
  books: Book[]
}

export interface LibrarySummary {
  total: number
  /** Book count per Reading status, keyed by the raw status string. */
  counts: Record<string, number>
}

// Module-scoped singleton state: every `useLibrary()` call shares the same
// reactive Library, so components mount/unmount without losing state and a
// second component sees the same books.
const stored = useLocalStorage<StoredLibrary>(STORAGE_KEY, { version: STORAGE_VERSION, books: [] })
const warnings = ref<string[]>([])
const error = ref<string | null>(null)

const books = computed<Book[]>(() => stored.value?.books ?? [])

function setBooks(newBooks: Book[]) {
  stored.value = { version: STORAGE_VERSION, books: newBooks }
}

const summary = computed<LibrarySummary>(() => {
  const counts: Record<string, number> = {}
  for (const book of books.value) {
    counts[book.status] = (counts[book.status] ?? 0) + 1
  }
  return { total: books.value.length, counts }
})

function applyResult(result: { books: Book[], warnings: string[] }) {
  setBooks(result.books)
  warnings.value = result.warnings
  error.value = null
}

/**
 * Reactive Library store, shared across every component that calls it.
 * Persisted to `localStorage` under `bookshelf:library:v1` (client only).
 */
export function useLibrary() {
  async function importFile(file: File) {
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
      else {
        error.value = 'Could not read that file. Please try again.'
      }
    }
  }

  function loadDemo() {
    try {
      const result = importLibrary(demoLibraryCsv)
      applyResult(result)
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not load the demo library.'
    }
  }

  function clear() {
    setBooks([])
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
    clear,
  }
}
