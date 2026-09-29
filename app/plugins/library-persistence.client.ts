import { watch } from 'vue'
import {
  LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_VERSION,
  useLibraryRestored,
  type StoredLibrary,
} from '~/composables/useLibrary'
import type { Book } from '#shared/types/book'

/**
 * Restores the Library from localStorage after hydration (never during SSR
 * or before the client has hydrated the server-rendered empty state), then
 * keeps localStorage in sync as the Library changes.
 *
 * Doing this in `app:mounted` — instead of reading localStorage at
 * `useLibrary()` module/composable init time — avoids the classic "server
 * rendered empty, client rendered restored" hydration mismatch.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const books = useState<Book[]>('library:books', () => [])
    const restored = useLibraryRestored()

    restoreFromStorage(books)
    restored.value = true

    watch(
      books,
      (value) => {
        persistToStorage(value)
      },
      { deep: true },
    )
  })
})

function readStoredLibrary(): StoredLibrary | null {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredLibrary
  }
  catch {
    // localStorage unavailable (private mode, disabled) or malformed JSON —
    // nothing to restore.
    return null
  }
}

function restoreFromStorage(books: ReturnType<typeof useState<Book[]>>) {
  const parsed = readStoredLibrary()

  if (!parsed || parsed.version !== LIBRARY_STORAGE_VERSION || !Array.isArray(parsed.books)) {
    // Missing, unknown/mismatched version, or malformed shape — discard
    // rather than trust it.
    return
  }

  books.value = parsed.books
}

function persistToStorage(currentBooks: Book[]) {
  try {
    if (currentBooks.length === 0) {
      window.localStorage.removeItem(LIBRARY_STORAGE_KEY)
      return
    }
    const payload: StoredLibrary = { version: LIBRARY_STORAGE_VERSION, books: currentBooks }
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(payload))
  }
  catch {
    // localStorage unavailable or over quota — in-memory state still works.
  }
}
