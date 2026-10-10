// The Book as RegalBooksDeal needs it: the host maps its own Books to this.
// Pure (no DOM): the measures come from the same function as the Stack's.
import { bookDimensions } from '../bookcase/layout'
import type { DealDims } from './types'

/** A Book as the deal needs it (the host maps its own Books to this). */
export interface DealBook {
  id: string
  title: string
  author?: string | null
  seriesTitle?: string | null
  pages?: number | null
  /** 'Hardcover' | 'Paperback' | ...: the Book's height, as `bookDimensions`. */
  binding?: string | null
  /** The front image; must be loadable cross-origin (fetch, then createImageBitmap, as Regal's covers). */
  coverUrl?: string | null
  /** '#rrggbb': the cover's main colour, used before and without the image. */
  color?: string | null
}

export type DealVariant = 'deck' | 'stack' | 'wheel'

/** Where the winner's front cover rests, in viewport CSS px. */
export interface DealPicked {
  index: number
  id: string
  rect: { left: number, top: number, width: number, height: number }
}

export const DEAL_MIN_BOOKS = 1
export const DEAL_MAX_BOOKS = 12

/** A Book's thickness, height and cover width in metres (nothing limits it to a Shelf). */
export function dealDims(book: Pick<DealBook, 'id' | 'pages' | 'binding'>): DealDims {
  return bookDimensions({ id: book.id, pages: book.pages ?? null, binding: book.binding ?? null }, 1, 1)
}
