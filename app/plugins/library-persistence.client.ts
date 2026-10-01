import { watch } from 'vue'
import {
  useLibrary,
  LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_VERSION,
  useLibraryRestored,
  type StoredLibrary,
} from '~/composables/useLibrary'
import type { Book } from '~~/shared/types/book'

/**
 * Restores the Library from localStorage after hydration (never during SSR
 * or before the client has hydrated the server-rendered empty state), then
 * keeps localStorage in sync as the Library changes.
 *
 * Doing this in `app:mounted` — instead of reading localStorage at
 * `useLibrary()` module/composable init time — avoids the classic "server
 * rendered empty, client rendered restored" hydration mismatch.
 *
 * Not in 'embed' mode: there the Library comes from the host's `librarySrc`
 * and a visitor's stored upload must neither replace it nor be overwritten.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const embedded = useRegalConfig().mode === 'embed'
  nuxtApp.hook('app:mounted', () => {
    const books = useState<Book[]>('library:books', () => [])
    const restored = useLibraryRestored()
    if (embedded) {
      restored.value = true
      return
    }

    const hadStored = readStoredLibrary() !== null || wasClearedInDev()
    restoreFromStorage(books)

    // Dev: a browser that has never stored a Library (fresh profile, another
    // browser like Orca's) gets the asset pipeline's library.json, like the
    // "My library (dev)" button. A deliberately cleared Library stays empty.
    if (import.meta.dev && !hadStored) {
      const { assetsBase } = useRegalConfig()
      void useLibrary().loadUrl(`${assetsBase}library.json`)
    }
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

/** Dev only: marks a Library the user cleared, so the dev auto-load doesn't refill it. */
const DEV_CLEARED_KEY = `${LIBRARY_STORAGE_KEY}:dev-cleared`

function wasClearedInDev(): boolean {
  try {
    return window.localStorage.getItem(DEV_CLEARED_KEY) === '1'
  }
  catch {
    return false
  }
}

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
      if (import.meta.dev) window.localStorage.setItem(DEV_CLEARED_KEY, '1')
      return
    }
    if (import.meta.dev) window.localStorage.removeItem(DEV_CLEARED_KEY)
    const payload: StoredLibrary = { version: LIBRARY_STORAGE_VERSION, books: currentBooks }
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(payload))
  }
  catch {
    // localStorage unavailable or over quota — in-memory state still works.
  }
}
