import type { ImportLibraryResult } from '#layers/regal/shared/library/importLibrary'
import { importReadingTracker, looksLikeJson } from '#layers/regal/shared/library/importReadingTracker'
import type { NuxtApp } from '#app'

/** One load per app (per request on the server), however many embed components ask. */
const pending = new WeakMap<NuxtApp, Promise<void>>()

/**
 * 'embed' mode: fills the shared Library from `librarySrc` once. Used by
 * RegalBooksStage and RegalBooksSidebar, so either can be on the page alone.
 *
 * Loads during server rendering, so the records are in the HTML: through the
 * host's own server first, then over HTTP from the page's origin (static files
 * the server can't read itself: `nuxt dev`, Cloudflare). If both fail the
 * browser loads it after mounting.
 */
export function useRegalLibrary() {
  const library = useLibrary()
  const { mode, librarySrc } = useRegalConfig()
  if (mode !== 'embed' || !librarySrc) return library

  const nuxtApp = useNuxtApp()
  const loaded = useState('regal:library-loaded', () => false)
  const origin = import.meta.server ? useRequestURL().origin : ''

  function fetchLibrary(): Promise<ImportLibraryResult> {
    const get = (src: string) => $fetch<string>(src, { responseType: 'text' }).then(parseLibrary)
    if (import.meta.client || !librarySrc.startsWith('/')) return get(librarySrc)
    return get(librarySrc).catch(() => get(new URL(librarySrc, origin).href))
  }

  function load(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    let promise = pending.get(nuxtApp)
    if (!promise) {
      promise = fetchLibrary()
        .then(({ books, warnings }) => {
          library.books.value = books
          library.warnings.value = warnings
          library.error.value = null
          loaded.value = true
        })
        .catch((caught: unknown) => {
          // The server gives up quietly (once per request); the browser tries again and reports.
          if (import.meta.server) return
          pending.delete(nuxtApp)
          library.error.value = `Could not load the library (${caught instanceof Error ? caught.message : String(caught)})`
        })
      pending.set(nuxtApp, promise)
    }
    return promise
  }

  if (import.meta.server) onServerPrefetch(load)
  onMounted(load)
  return library
}

/**
 * A reading-tracker JSON export parses anywhere; a Goodreads CSV only in the
 * browser. The CSV parser (Papa Parse) is kept out of server bundles: its web
 * worker source is a string containing `typeof window`, which some server
 * builds (e.g. a Nuxt host deployed to Cloudflare) rewrite into invalid code.
 */
const loadCsvImporter = () => import.meta.server
  ? Promise.reject(new Error('CSV libraries load in the browser only.'))
  : import('#layers/regal/shared/library/importLibrary')

async function parseLibrary(text: string): Promise<ImportLibraryResult> {
  if (looksLikeJson(text)) return importReadingTracker(text)
  if (import.meta.server) throw new Error('A Goodreads CSV as `librarySrc` is read in the browser only.')
  return (await loadCsvImporter()).importLibrary(text)
}
