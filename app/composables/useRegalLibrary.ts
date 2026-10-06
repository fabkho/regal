import type { MaybeRefOrGetter } from 'vue'
import type { NuxtApp } from '#app'
import { NO_SOURCE_ERROR, readLibraryFile, unreachableFileError } from '#layers/regal/app/utils/library/libraryFile'
import type { LibraryReadResult } from '#layers/regal/app/utils/library/libraryFile'
import { markRegal } from '#layers/regal/app/utils/stage/marks'
import { fetchLibraryFile, readLibraryFileNow } from '#layers/regal/app/utils/library/libraryCache'

/** One fetch per file per app (per request on the server), however many components ask. */
const pending = new WeakMap<NuxtApp, Map<string, Promise<LibraryReadResult>>>()

export interface RegalLibraryOptions {
  /**
   * Load during server rendering (default), so the records are in the HTML.
   * Off for a URL a visitor typed (the viewer's `?src=`): the server never
   * fetches what a visitor names.
   */
  server?: boolean
}

/**
 * Fills the shared Library (useLibrary) from a Regal library file: `src`, by
 * default `runtimeConfig.public.regal.librarySrc`. Used by RegalBooksStage,
 * RegalBooksSidebar and Regal's own page, so any of them can be on a page alone.
 *
 * Loads during server rendering: through the host's own server first, then
 * over HTTP from the page's origin (static files the server can't read itself:
 * `nuxt dev`, Cloudflare). If both fail the browser loads it after mounting
 * and reports what went wrong. An invalid file is reported at once.
 */
export function useRegalLibrary(src?: MaybeRefOrGetter<string | null | undefined>, options: RegalLibraryOptions = {}) {
  const library = useLibrary()
  const { librarySrc } = useRegalConfig()
  const wanted = computed(() => toValue(src)?.trim() || librarySrc)
  const nuxtApp = useNuxtApp()
  /** The file whose Library (or error) the state holds. */
  const loaded = useState<string | null>('regal:library-loaded', () => null)
  const origin = import.meta.server ? useRequestURL().origin : ''

  function fetchLibrary(file: string): Promise<LibraryReadResult> {
    // In the browser through the page's cache of library files, which preloadRegal may have filled.
    if (import.meta.client) return fetchLibraryFile(absolute(file))
    const get = (url: string) => $fetch<string>(url, { responseType: 'text' }).then(readLibraryFile)
    if (!file.startsWith('/') || file.startsWith('//')) return get(file)
    return get(file).catch(() => get(new URL(file, origin).href))
  }

  const absolute = (file: string) => new URL(file, window.location.href).href

  function apply(file: string, result: LibraryReadResult) {
    if (import.meta.client) markRegal('library:shown')
    if (result.ok) library.show(result.library, file)
    else library.fail(result.error, file)
    loaded.value = file
  }

  function load(): Promise<void> {
    const file = wanted.value
    if (loaded.value === file) return Promise.resolve()
    if (!file) {
      library.fail(NO_SOURCE_ERROR, null)
      loaded.value = file
      return Promise.resolve()
    }
    if (import.meta.server && options.server === false) return Promise.resolve()

    const loads = pending.get(nuxtApp) ?? new Map<string, Promise<LibraryReadResult>>()
    pending.set(nuxtApp, loads)
    let fetched = loads.get(file)
    if (!fetched) {
      fetched = fetchLibrary(file)
      loads.set(file, fetched)
    }
    // Shown by every call: going back to a file read before shows it again.
    return fetched
      .then((result) => {
        // Another file was asked for meanwhile: that one shows.
        if (wanted.value !== file) return
        apply(file, result)
      })
      .catch((caught: unknown) => {
        loads.delete(file)
        // The server gives up quietly (once per request); the browser tries again and reports.
        if (import.meta.server || wanted.value !== file) return
        library.fail(unreachableFileError(file, caught), file)
        loaded.value = file
      })
  }

  // Read already in this page (preloadRegal, another row): shown in this first render, no
  // frame without it. Not while hydrating: the server's HTML must match.
  if (import.meta.client && wanted.value && loaded.value !== wanted.value && !nuxtApp.isHydrating) {
    const ready = readLibraryFileNow(absolute(wanted.value))
    if (ready) apply(wanted.value, ready)
  }

  if (import.meta.server) onServerPrefetch(load)
  onMounted(load)
  if (import.meta.client) watch(wanted, () => void load())
  return library
}
