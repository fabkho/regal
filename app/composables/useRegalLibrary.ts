import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import type { NuxtApp } from '#app'
import { NO_SOURCE_ERROR, readLibraryFile, unreachableFileError } from '#layers/regal/app/utils/library/libraryFile'
import type { LibraryReadResult } from '#layers/regal/app/utils/library/libraryFile'
import { markRegal } from '#layers/regal/app/utils/stage/marks'
import { fetchLibraryFile, readLibraryFileNow } from '#layers/regal/app/utils/library/libraryCache'

/** One fetch per file per app (per request on the server), however many components ask. */
interface Load {
  result: Promise<LibraryReadResult>
  /** Done, one way or the other: only a request in flight is joined by a retry. */
  settled: boolean
}
const pending = new WeakMap<NuxtApp, Map<string, Load>>()

/** What the built-in error card needs to offer Try again (provided by useRegalLibrary to the components below it). */
export interface RegalLibraryRetry {
  retry: () => Promise<void>
  /** A request for the library file is on its way. */
  loading: Readonly<Ref<boolean>>
}
export const REGAL_LIBRARY_RETRY: InjectionKey<RegalLibraryRetry> = Symbol('regal-library-retry')

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
 *
 * A load that failed (offline, 5xx, CORS, bad JSON, an invalid file) is never
 * kept as the answer: the next mount asks again, and `retry()` asks now. A
 * file that loaded stays for the page, a remount makes no request.
 *
 * Returns the shared Library (`books`, `error` …) plus:
 * - `retry()`: after a failure, fetches the file again and shows the result (a
 *   request already on its way is joined, never doubled); resolves when it is
 *   shown. Does nothing while the Library is shown. Call it from a host's own
 *   "Try again" (docs/nuxt-layer.md: "Loading errors and retry").
 * - `loading`: a request is on its way.
 */
export function useRegalLibrary(src?: MaybeRefOrGetter<string | null | undefined>, options: RegalLibraryOptions = {}) {
  const library = useLibrary()
  const { librarySrc } = useRegalConfig()
  const wanted = computed(() => toValue(src)?.trim() || librarySrc)
  const nuxtApp = useNuxtApp()
  /** The file whose Library (or error) the state holds. */
  const loaded = useState<string | null>('regal:library-loaded', () => null)
  /** A request is on its way (the browser only; the server's is over before the page is). */
  const loading = useState<boolean>('regal:library-loading', () => false)
  const origin = import.meta.server ? useRequestURL().origin : ''

  function fetchLibrary(file: string, fresh: boolean): Promise<LibraryReadResult> {
    // In the browser through the page's cache of library files, which preloadRegal may have filled.
    if (import.meta.client) return fetchLibraryFile(absolute(file), fresh)
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

  function load(fresh = false): Promise<void> {
    const file = wanted.value
    // Shown already; a failure is not an answer to keep, so a mount after one asks again.
    if (!fresh && loaded.value === file && !library.error.value) return Promise.resolve()
    if (!file) {
      library.fail(NO_SOURCE_ERROR, null)
      loaded.value = file
      return Promise.resolve()
    }
    if (import.meta.server && options.server === false) return Promise.resolve()

    const loads = pending.get(nuxtApp) ?? new Map<string, Load>()
    pending.set(nuxtApp, loads)
    let started = loads.get(file)
    // A retry joins a request on its way, but never a finished one.
    if (started?.settled && fresh) started = undefined
    if (!started) {
      const created: Load = { result: fetchLibrary(file, fresh), settled: false }
      // A file that failed is dropped as soon as it settles, so no later call is handed the failure.
      const settled = (kept: boolean) => {
        created.settled = true
        if (!kept && loads.get(file) === created) loads.delete(file)
      }
      created.result.then(result => settled(result.ok), () => settled(false))
      loads.set(file, created)
      started = created
    }
    if (import.meta.client) loading.value = true
    // Shown by every call: going back to a file read before shows it again.
    return started.result
      .then((result) => {
        // Another file was asked for meanwhile: that one shows.
        if (wanted.value !== file) return
        apply(file, result)
      })
      .catch((caught: unknown) => {
        // The server gives up quietly (once per request); the browser tries again and reports.
        if (import.meta.server || wanted.value !== file) return
        library.fail(unreachableFileError(file, caught), file)
        loaded.value = file
      })
      .finally(() => {
        if (wanted.value === file) loading.value = false
      })
  }

  /**
   * Asks for the file again after a failure (a request on its way is joined) and
   * shows what comes back. Does nothing while the Library is shown.
   */
  function retry(): Promise<void> {
    if (loaded.value === wanted.value && !library.error.value && !loading.value) return Promise.resolve()
    return load(true)
  }

  // Read already in this page (preloadRegal, another row): shown in this first render, no
  // frame without it. Not while hydrating: the server's HTML must match.
  if (import.meta.client && wanted.value && loaded.value !== wanted.value && !nuxtApp.isHydrating) {
    const ready = readLibraryFileNow(absolute(wanted.value))
    if (ready) apply(wanted.value, ready)
  }

  if (import.meta.server) onServerPrefetch(() => load())
  onMounted(() => void load())
  if (import.meta.client) watch(wanted, () => void load())
  // The built-in error card (Try again) reaches this through the components below.
  if (getCurrentInstance()) provide(REGAL_LIBRARY_RETRY, { retry, loading })
  return { ...library, retry, loading }
}
