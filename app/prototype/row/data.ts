// Design round (horizontal Stack): which Books a prototype row shows. Dev
// only, never part of the layer's surface. Pure.
import type { Book } from '#layers/regal/shared/types/book'
import type { BookAssetEntry } from '#layers/regal/app/utils/covers/bookAssets'
import { sortForShelves } from '#layers/regal/app/utils/bookcase/layout'

export type RowOrder = 'newest' | 'chrono'

/** Where the prototypes take their Library from. */
export const ROW_SOURCES = {
  /** The synthetic demo library (8 Books, drawn faces). */
  demo: '/demo-library.json',
  /** The published shelf (77 Books with AI art), through the dev proxy (nuxt.config.ts). */
  published: '/_published/v2/library.json',
} as const

export type RowSource = keyof typeof ROW_SOURCES

/**
 * The Books a row shows: what is being read and what was read (as the Profile
 * and the year in review would), newest first, cut to `count`. Asked for more
 * than the Library has, it repeats the read Books with their dates moved back
 * by whole spans of years and ids suffixed, so a 100-Book row can be tried
 * with a 77-Book shelf. Their assets are the originals'.
 */
export function rowBooks(
  books: Book[],
  assets: Record<string, BookAssetEntry>,
  options: { count?: number | null, year?: number | null } = {},
): { books: Book[], assets: Record<string, BookAssetEntry> } {
  const shown = sortForShelves(books.filter(book => book.status === 'currently-reading' || (book.status === 'read' && book.dateRead)))
  let list = options.year
    ? shown.filter(book => book.dateRead?.startsWith(String(options.year)))
    : shown
  const outAssets: Record<string, BookAssetEntry> = { ...assets }
  const count = options.count ?? null
  if (count !== null && count > list.length && !options.year) {
    const read = list.filter(book => book.dateRead)
    const years = read.map(book => Number(book.dateRead!.slice(0, 4)))
    const span = years.length ? Math.max(...years) - Math.min(...years) + 1 : 1
    const extra: Book[] = []
    for (let copy = 1; list.length + extra.length < count && read.length; copy++) {
      for (const book of read) {
        if (list.length + extra.length >= count) break
        const id = `${book.id}~${copy}`
        const year = Number(book.dateRead!.slice(0, 4)) - span * copy
        extra.push({ ...book, id, dateRead: `${year}${book.dateRead!.slice(4)}` })
        if (assets[book.id]) outAssets[id] = assets[book.id]!
      }
    }
    list = [...list, ...extra]
  }
  if (count !== null) list = list.slice(0, count)
  return { books: list, assets: outAssets }
}
