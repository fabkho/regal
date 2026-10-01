// Stack layout: the whole Library as one pile of Books lying flat, front
// Cover up and Spine towards the viewer, so the Spines read left to right.
// Currently-reading and the most recent reads sit on top. Pure and
// deterministic (seeded by Book Id).
import type { Book } from '~~/shared/types/book'
import type { BookPose } from '~/utils/books/pose'
import { bookDimensions, CLOTH_COLORS, hashString, random01, sortForShelves } from '../bookcase/layout'

export interface StackResult {
  poses: BookPose[]
  /** Height of the whole pile, metres. */
  height: number
}

/** Room around a lying Book, so neighbours never intersect. */
const LAYER_GAP = 0.0008
/** Books lie flat, so no Shelf limits their size. */
const FREE_CLEARANCE = 1
const FREE_DEPTH = 1
/** Hand-stacked look: small sideways and front/back offsets and twists. */
const MAX_OFFSET_X = 0.018
const MAX_OFFSET_Z = 0.008
const MAX_TWIST = 0.07

/**
 * Lays the Library out bottom to top. Lying flat means rotating the Book a
 * quarter turn about the view axis: its front Cover (+x) faces up, its top
 * (+y) points left, and the Spine (+z) still faces the viewer.
 */
export function layoutStack(books: Book[], options: { keepOrder?: boolean } = {}): StackResult {
  // keepOrder: the Books are already sorted top of the pile first (Stack view settings).
  const topFirst = options.keepOrder ? books : sortForShelves(books)
  const bottomFirst = [...topFirst].reverse()
  const poses: BookPose[] = []
  let y = 0
  for (const book of bottomFirst) {
    const dims = bookDimensions(book, FREE_CLEARANCE, FREE_DEPTH)
    const twist = (random01(book.id, 'stack-twist') - 0.5) * 2 * MAX_TWIST
    poses.push({
      bookId: book.id,
      ...dims,
      x: (random01(book.id, 'stack-x') - 0.5) * 2 * MAX_OFFSET_X,
      y: y + dims.thickness / 2,
      z: (random01(book.id, 'stack-z') - 0.5) * 2 * MAX_OFFSET_Z,
      // Twist about the vertical first, then lie the Book down (XYZ order applies Z first).
      rotation: [0, twist, Math.PI / 2],
      color: CLOTH_COLORS[hashString(book.id) % CLOTH_COLORS.length]!,
      section: book.status,
    })
    y += dims.thickness + LAYER_GAP
  }
  return { poses, height: y }
}
