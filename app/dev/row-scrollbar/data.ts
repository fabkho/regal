// Dev only (/dev/row-scrollbar): which Books the page shows and the Libellus
// colours it themes the row with. Pure; not part of the layer's surface.
import type { Book } from '#layers/regal/shared/types/book'
import type { BookAssetEntry } from '#layers/regal/app/utils/covers/bookAssets'
import { sortForShelves } from '#layers/regal/app/utils/bookcase/layout'

/** The published shelf (77 Books, AI art) through the dev proxy (nuxt.config.ts). */
export const PUBLISHED_SRC = '/_published/v2/library.json'

/** How many Books to try: 5 (the row doesn't scroll), 30 (it barely does), 100 (the budget). */
export const COUNTS = [5, 30, 50, 77, 100] as const

/**
 * The Books a row shows (what the Profile shows): read and being read, newest
 * first, cut to `count`. Asked for more than the Library has, it repeats the
 * read Books with their dates moved back by whole spans of years and ids
 * suffixed (their assets are the originals').
 */
export function pickBooks(
  books: Book[],
  assets: Record<string, BookAssetEntry>,
  count: number,
): { books: Book[], assets: Record<string, BookAssetEntry> } {
  const shown = sortForShelves(books.filter(book => book.status === 'currently-reading' || (book.status === 'read' && book.dateRead)))
  const outAssets: Record<string, BookAssetEntry> = { ...assets }
  let list = shown
  if (count > list.length) {
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
  return { books: list.slice(0, count), assets: outAssets }
}

/**
 * Libellus' design D ("Night Reader"), the roles the demo needs (libellus
 * design/tokens.json): the room, the card, ink, faint ink, the lamp.
 */
export const LIBELLUS = {
  light: {
    room: '#f4f0e9',
    surface: '#fbf9f5',
    ink: '#1c1915',
    inkMuted: 'rgb(28 25 21 / 0.64)',
    inkFaint: 'rgb(28 25 21 / 0.45)',
    hairline: 'rgb(40 30 20 / 0.1)',
    border: 'rgb(40 30 20 / 0.17)',
    accent: '#b8782a',
    shadow: 'inset 0 1px 0 rgb(255 255 255 / 0.6), 0 14px 34px rgb(60 40 20 / 0.14)',
  },
  dark: {
    room: '#0e0c0a',
    surface: '#171512',
    ink: '#eee7dc',
    inkMuted: 'rgb(238 231 220 / 0.64)',
    inkFaint: 'rgb(238 231 220 / 0.42)',
    hairline: 'rgb(255 236 210 / 0.085)',
    border: 'rgb(255 236 210 / 0.16)',
    accent: '#efb768',
    shadow: 'inset 0 1px 0 rgb(255 255 255 / 0.04), 0 18px 40px rgb(0 0 0 / 0.5)',
  },
} as const
