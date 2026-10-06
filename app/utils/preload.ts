// preloadRegal: a host warms what RegalBooksRow waits for on its first look,
// before the row mounts (README: "Preloading"). It fetches and reads the
// library file (the page's cache useRegalLibrary reads first), fetches the
// row's code (the chunk RegalBooksRow, three.js and TresJS live in), and
// draws the Spines and page edges of the Books the row opens on into the
// page's face cache (utils/row/faceCache.ts), exactly as the row would.
// The row then shows them on its first frame and starts its intro there.
//
// Everything is kept for the page (module level), so a second call, another
// row or the row mounted again reuses it. Safe to call any number of times,
// before any row exists, and on the server (where it does nothing).
import type { Book } from '#layers/regal/shared/types/book'
import { fetchLibraryFile } from '#layers/regal/app/utils/library/libraryCache'
import { resolveLibraryUrl } from '#layers/regal/app/utils/library/libraryFile'
import type { LoadedLibrary } from '#layers/regal/app/utils/library/libraryFile'
import { assetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { drawSpine, SPINE_AUTHOR_FONT, SPINE_TITLE_FONT } from '#layers/regal/app/utils/covers/bookFaces'
import { loadPicture } from '#layers/regal/app/utils/covers/images'
import { drawPageEdges, pageEdgePlan } from '#layers/regal/app/utils/books/pageEdges'
import { layoutRow, ROW_CAMERA, rowBooks } from '#layers/regal/app/utils/row/layout'
import { rowEdges, rowSpines } from '#layers/regal/app/utils/row/faceCache'
import { ART_HEIGHT, drawsWithoutFront, edgesBoard, rowFaceInput, rowFaceKeys, rowSpineScale } from '#layers/regal/app/utils/row/faces'
import { renderQuality } from '#layers/regal/app/utils/stage/quality'
import { markRegal } from '#layers/regal/app/utils/stage/marks'

export interface PreloadRegalOptions {
  /** The library file (default: `runtimeConfig.public.regal.librarySrc`, as the row). */
  src?: string
  /** The row's `limit` and `year`: which Books it shows, and where it opens (a year row: January). */
  limit?: number | null
  year?: number | null
  /**
   * Spines to draw ahead: as many as the card shows at rest (`'visible'`,
   * the default), the first this many from where the row opens, or none (`false`).
   */
  spines?: 'visible' | number | false
  /** The card's size in CSS px, for which Books show and the Spines' resolution (default: the viewport's width × 288, RegalBooksRow's minimum height). */
  width?: number
  height?: number
  /**
   * The row's code: fetched with RegalBooksRow's own chunk (`true`, the
   * default), with the host's (an import of the host's component that wraps
   * the row, which may also bring the Spine fonts' @font-face rules), or not.
   */
  chunk?: boolean | (() => Promise<unknown>)
}

/** Every warm-up asked for in this page, by its options. */
const runs = new Map<string, Promise<void>>()

/**
 * Warms Regal for a RegalBooksRow that will mount later. Resolves once done;
 * never rejects (whatever didn't warm, the row loads as it would have). Call
 * it where the owner's row is likely next, on idle (README: "Preloading").
 */
export function preloadRegal(options: PreloadRegalOptions = {}): Promise<void> {
  if (import.meta.server || typeof window === 'undefined') return Promise.resolve()
  const src = options.src ?? configuredSrc()
  if (!src) return Promise.resolve()
  const key = JSON.stringify([src, options.limit ?? null, options.year ?? null, options.spines ?? 'visible', options.width ?? null, options.height ?? null, typeof options.chunk === 'function' ? 'host' : options.chunk ?? true])
  let run = runs.get(key)
  if (!run) {
    // A warm-up that failed (offline) is tried again on the next call.
    run = warm(src, options).catch(() => void runs.delete(key))
    runs.set(key, run)
  }
  return run
}

async function warm(src: string, options: PreloadRegalOptions) {
  markRegal('preload:start')
  const page = window.location.href
  const chunk = options.chunk === false
    ? null
    : typeof options.chunk === 'function'
      ? options.chunk()
      : import('#layers/regal/app/components/regal/BooksRow.vue')
  const file = fetchLibraryFile(new URL(src, page).href)
  // The fonts' @font-face rules may come with the chunk (a host that keeps Regal in one).
  const [result] = await Promise.all([file, chunk?.catch(() => null)])
  if (result.ok && options.spines !== false && await spineFontsLoaded()) {
    await drawAhead(result.library, src, page, options)
  }
  markRegal('preload:done')
}

/** The Spine fonts are registered and loaded (no @font-face for them: Spines can't be drawn as the row will). */
async function spineFontsLoaded(): Promise<boolean> {
  if (!document.fonts) return false
  try {
    const [title, author] = await Promise.all([
      document.fonts.load(`20px ${SPINE_TITLE_FONT}`),
      document.fonts.load(`400 20px ${SPINE_AUTHOR_FONT}`),
    ])
    return title.length > 0 && author.length > 0
  }
  catch {
    return false
  }
}

/** The Books whose Spines show where the row opens: at rest (RowCard rowRest), the newest flush right, or a year's January flush left. */
export function booksAtRest(library: Pick<LoadedLibrary, 'books'>, options: Pick<PreloadRegalOptions, 'limit' | 'year' | 'spines' | 'width' | 'height'>): { book: Book, index: number }[] {
  const books = rowBooks(library.books, { limit: options.limit, year: options.year })
  const oldestFirst = [...books].reverse()
  const { poses } = layoutRow(oldestFirst)
  if (!poses.length) return []
  const fromRight = !options.year
  const ordered = poses.map((pose, index) => ({ pose, index }))
  if (fromRight) ordered.reverse()
  // As wide as the card shows, and a little beyond (the intro's margins, the first scroll).
  const metres = (options.width ?? 412) / ((options.height ?? 288) / ROW_CAMERA.viewHeight) * 1.25
  const edge = fromRight ? poses.at(-1)!.x + poses.at(-1)!.thickness / 2 : poses[0]!.x - poses[0]!.thickness / 2
  const take = typeof options.spines === 'number'
    ? Math.max(0, Math.floor(options.spines))
    : ordered.filter(({ pose }) => Math.abs(pose.x - edge) <= metres).length
  return ordered.slice(0, take).map(({ index }) => ({ book: oldestFirst[index]!, index }))
}

/** Draws the Spines and page edges of the Books the row opens on into the page's face cache, as RowBooks would. */
async function drawAhead(library: LoadedLibrary, src: string, page: string, options: PreloadRegalOptions) {
  const width = options.width ?? window.innerWidth
  const height = options.height ?? 288
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const scale = Math.min(1, rowSpineScale(height, Math.min(window.devicePixelRatio || 1, renderQuality({ coarsePointer: coarse }).maxDpr)))
  const books = rowBooks(library.books, { limit: options.limit, year: options.year })
  const { poses } = layoutRow([...books].reverse())
  await Promise.all(booksAtRest(library, { ...options, width, height }).map(async ({ book, index }) => {
    const pose = poses[index]!
    const entry = library.assets[book.id]
    const set = entry ? assetFaces(entry, reference => resolveLibraryUrl(reference, src, page)) : null
    if (!drawsWithoutFront(set)) return
    const keys = rowFaceKeys(book, pose, set, scale)
    if (rowSpines.get(keys.spine) && rowEdges.get(keys.edges)) return
    const art = set.spine ? await loadPicture(set.spine, undefined, set.entry.pile?.spine ? undefined : ART_HEIGHT) : null
    rowSpines.set(keys.spine, drawSpine({ ...rowFaceInput(book, pose, { set, spineArt: art ?? undefined }), resolution: scale }))
    rowEdges.set(keys.edges, drawPageEdges(pageEdgePlan(book, pose.thickness, pose.depth), edgesBoard(set, art), book.id))
    if (art && 'close' in art && typeof art.close === 'function') art.close()
  }))
}

/** The row's library file: the app's runtime config (read in the app's context, else from the page). */
function configuredSrc(): string | null {
  type Config = { public?: { regal?: { librarySrc?: string } } }
  try {
    return (useRuntimeConfig() as Config).public?.regal?.librarySrc || null
  }
  catch {
    // Called outside the app's context (an idle callback): the config the page carries.
    const page = (window as unknown as { __NUXT__?: { config?: Config } }).__NUXT__
    return page?.config?.public?.regal?.librarySrc || null
  }
}

/** Forgets every warm-up (tests). */
export function clearPreloads() {
  runs.clear()
}
