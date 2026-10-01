// Layout: turns a Library into Placements on the Bookcase's Shelves.
// Pure and deterministic (seeded by Book Id), no three.js dependency.
// Units are world metres, same origin as SHELF_SLOTS.
import type { Book } from '#layers/regal/shared/types/book'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import type { ShelfSlot } from './shelves'
import { BOOKCASE_SIZE, SHELF_COUNT, SHELF_SLOTS } from './shelves'

export interface BookDimensions {
  /** Spine thickness, along the Shelf (x). */
  thickness: number
  height: number
  /** Front-to-back, into the Shelf (z). */
  depth: number
}

/** A Book on a Shelf: its pose plus where in the Bookcase it sits. */
export interface Placement extends BookPose {
  /** 0 = first Bookcase; more are added to the right when a Library overflows. */
  bookcase: number
  /** Index into SHELF_SLOTS. */
  slot: number
}

export interface LayoutResult {
  placements: Placement[]
  bookcaseCount: number
}

export interface LayoutOptions {
  slots?: ShelfSlot[]
  /** How full a Shelf gets before Books continue on the next one. */
  fillRatio?: number
}

/** Space between neighbouring Books. */
export const BOOK_GAP = 0.0015
/** Extra space between two Sections on the same Shelf. */
export const SECTION_GAP = 0.03
/** Headroom kept between a Book and the board above. */
export const HEADROOM = 0.012
/** Thickest Book we draw; box sets and omnibus page counts would otherwise become bricks. */
export const MAX_THICKNESS = 0.085
/** Pages assumed when the export has no page count. */
export const DEFAULT_PAGES = 300
/** Distance between neighbouring Bookcases. */
export const BOOKCASE_SPACING = BOOKCASE_SIZE.width + 0.12

const SECTION_ORDER = ['currently-reading', 'read', 'to-read']

/** Muted book-cloth colours. */
export const CLOTH_COLORS = [
  '#7A2E2A', // oxblood
  '#8C3B2F', // brick
  '#2F4A3A', // forest
  '#3E5A4A', // sage-dark
  '#26344F', // navy
  '#3C4F6B', // slate blue
  '#B08A3E', // ochre
  '#C9B48A', // linen
  '#5A3A2A', // walnut
  '#6B5A45', // tobacco
  '#2E2B29', // charcoal
  '#6E2F45', // plum
  '#4B5A3A', // olive
  '#8A6A4A', // tan
  '#E3D6BC', // cream
  '#35535A', // teal
]

/** FNV-1a string hash → unsigned 32-bit int. */
export function hashString(value: string): number {
  let hash = 0x811C9DC5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Deterministic number in [0, 1) for a Book Id and a purpose. */
export function random01(id: string, salt: string): number {
  return hashString(`${salt}:${id}`) / 0x1_0000_0000
}

function baseHeight(binding: string | null): number {
  const value = (binding ?? '').toLowerCase()
  if (value.includes('hardcover') || value.includes('hardback') || value.includes('gebunden')) return 0.235
  if (value.includes('mass market')) return 0.17
  if (value.includes('paperback') || value.includes('taschenbuch')) return 0.18
  return 0.2
}

function isHardcover(binding: string | null): boolean {
  const value = (binding ?? '').toLowerCase()
  return value.includes('hardcover') || value.includes('hardback') || value.includes('gebunden')
}

/**
 * Book dimensions from page count and binding. Height gets ±6 % jitter seeded
 * by Book Id and is capped to the given clearance.
 */
export function bookDimensions(book: Pick<Book, 'id' | 'pages' | 'binding'>, clearance: number, shelfDepth: number): BookDimensions {
  const pages = book.pages && book.pages > 0 ? book.pages : DEFAULT_PAGES
  const board = isHardcover(book.binding) ? 0.006 : 0.002
  const thickness = Math.min(MAX_THICKNESS, Math.max(0.008, pages * 0.00007 + board))
  const jitter = 1 + (random01(book.id, 'height') - 0.5) * 0.12
  const height = Math.min(baseHeight(book.binding) * jitter, clearance - HEADROOM)
  const depth = Math.min(height * 0.67, shelfDepth - 0.006)
  return { thickness, height, depth }
}

function sectionRank(status: string): number {
  const index = SECTION_ORDER.indexOf(status)
  return index === -1 ? SECTION_ORDER.length : index
}

/** Newest first; Books without a date go last. */
function compareDatesDesc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? 1 : -1
}

/** Section order, then date read (newest first), then date added, then title. */
export function sortForShelves(books: Book[]): Book[] {
  return [...books].sort((a, b) =>
    sectionRank(a.status) - sectionRank(b.status)
    || a.status.localeCompare(b.status)
    || compareDatesDesc(a.dateRead, b.dateRead)
    || compareDatesDesc(a.dateAdded, b.dateAdded)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id),
  )
}

/**
 * Places Books on Shelves, left to right across the bays of a Shelf, then down
 * to the next Shelf. Small Libraries are centred vertically on the Bookcase so
 * they sit at eye level instead of huddling on the top Shelf.
 */
export function layoutLibrary(books: Book[], options: LayoutOptions = {}): LayoutResult {
  const slots = options.slots ?? SHELF_SLOTS
  const fillRatio = options.fillRatio ?? 0.86
  if (books.length === 0 || slots.length === 0) return { placements: [], bookcaseCount: 1 }

  const sorted = sortForShelves(books)
  const shelfCount = Math.max(...slots.map(slot => slot.shelf)) + 1 || SHELF_COUNT
  const baysPerShelf = slots.length / shelfCount

  // Estimate how many Shelves the Library needs, to centre small ones.
  const averageWidth = slots.reduce((sum, slot) => sum + (slot.xEnd - slot.xStart), 0) / slots.length
  const totalThickness = sorted.reduce((sum, book) => {
    const pages = book.pages && book.pages > 0 ? book.pages : DEFAULT_PAGES
    return sum + Math.max(0.008, pages * 0.00007 + 0.004) + BOOK_GAP
  }, 0)
  const shelvesNeeded = Math.ceil(totalThickness / (averageWidth * fillRatio * baysPerShelf))
  const firstShelf = shelvesNeeded >= shelfCount ? 0 : Math.floor((shelfCount - shelvesNeeded) / 2)

  // Slots in reading order, starting at the first used Shelf, then repeating
  // across as many Bookcases as it takes.
  const orderedSlots = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.shelf - b.slot.shelf || a.slot.bay - b.slot.bay)
  const firstBookcaseSlots = orderedSlots.filter(entry => entry.slot.shelf >= firstShelf)

  const placements: Placement[] = []
  let bookcase = 0
  let slotCursor = 0
  let currentSlots = firstBookcaseSlots
  let cursorX = currentSlots[0]!.slot.xStart
  let previousSection: string | null = null

  for (const book of sorted) {
    let entry = currentSlots[slotCursor]!
    let dims = bookDimensions(book, entry.slot.clearance, entry.slot.zFront - entry.slot.zBack)
    let gap = previousSection !== null && previousSection !== book.status ? SECTION_GAP : 0
    const usable = (entry.slot.xEnd - entry.slot.xStart) * fillRatio

    if (cursorX + gap + dims.thickness > entry.slot.xStart + usable && cursorX > entry.slot.xStart) {
      slotCursor++
      if (slotCursor >= currentSlots.length) {
        bookcase++
        slotCursor = 0
        currentSlots = orderedSlots
      }
      entry = currentSlots[slotCursor]!
      dims = bookDimensions(book, entry.slot.clearance, entry.slot.zFront - entry.slot.zBack)
      cursorX = entry.slot.xStart
      gap = 0
    }

    cursorX += gap
    const { slot } = entry
    const offsetX = bookcase * BOOKCASE_SPACING
    placements.push({
      bookId: book.id,
      bookcase,
      slot: entry.index,
      ...dims,
      x: offsetX + cursorX + dims.thickness / 2,
      y: slot.y + dims.height / 2,
      // Flush with the front of the Shelf, like books pulled forward.
      z: slot.zFront - 0.004 - dims.depth / 2,
      rotation: [0, (random01(book.id, 'yaw') - 0.5) * 0.02, 0],
      color: CLOTH_COLORS[hashString(book.id) % CLOTH_COLORS.length]!,
      section: book.status,
    })
    cursorX += dims.thickness + BOOK_GAP
    previousSection = book.status
  }

  return { placements, bookcaseCount: bookcase + 1 }
}
