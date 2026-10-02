/**
 * The Regal library file: the one input the display reads (see
 * docs/library-file.md and CONTEXT.md). A producer (a Pipeline: today's daily
 * build, later Libellus) writes it; `validateLibraryFile` checks it.
 *
 * Optional fields may be left out or set to null; both mean "unknown".
 */

export const LIBRARY_FILE_VERSION = 2

export interface RegalLibraryFile {
  version: typeof LIBRARY_FILE_VERSION
  /** When the producer wrote the file: ISO 8601 date-time with offset or Z. */
  generatedAt: string
  /** Whose Library this is, as shown to visitors ("Fabian"). */
  owner?: string | null
  /** Which Pipeline wrote the file ("regal-pipeline", "libellus"); informational. */
  generator?: string | null
  books: LibraryBook[]
}

/** Known Reading status values; any other non-empty string is a custom one. */
export type KnownReadingStatus = 'read' | 'currently-reading' | 'to-read' | 'dnf'

export interface LibraryBook {
  /** Stable, unique within the file. The display keys picks and assets on it. */
  id: string
  /** Without the series part: "Golden Son", not "Golden Son (Red Rising, #2)". */
  title: string
  /** Series and number as shown: "Red Rising, #2". */
  seriesTitle?: string | null
  /** In credit order, first = main author. May be empty. */
  authors: string[]
  /** 13 digits, no hyphens, 978/979 prefix. */
  isbn13?: string | null
  /** 9 digits plus a digit or X, no hyphens. */
  isbn10?: string | null
  /** Page count, a positive integer: the Book's thickness. */
  pages?: number | null
  /** Paperback, Hardcover, Kindle Edition, Audiobook…: the Book's height. */
  binding?: string | null
  /** Year this edition was published. */
  yearPublished?: number | null
  /** Year the work was first published. */
  originalYear?: number | null
  /** Reading status: read | currently-reading | to-read | dnf | a custom exclusive shelf. */
  status: KnownReadingStatus | (string & {})
  /** Finished reading, YYYY-MM-DD. */
  dateRead?: string | null
  /** Started reading, YYYY-MM-DD. */
  dateStarted?: string | null
  /** Added to the Library, YYYY-MM-DD. */
  dateAdded?: string | null
  /** Quarter stars from 0 to 5; 0 (or absent) = unrated. */
  rating?: number | null
  review?: string | null
  /** The review gives the plot away: hidden behind a click. Default false. */
  reviewHasSpoiler?: boolean | null
  /** How often it was finished. Default 0. */
  readCount?: number | null
  /** Blurb for the details panel and the drawn back cover; plain text. */
  description?: string | null
  /** Publisher imprint, printed at the foot of a drawn back cover. */
  publisher?: string | null
  /** Shelf category for a drawn back cover: "SCIENCE FICTION". */
  genre?: string | null
  /** Up to two lines of praise for a drawn back cover. */
  quotes?: LibraryQuote[] | null
  assets?: LibraryBookAssets | null
}

export interface LibraryQuote {
  text: string
  /** Who said it: "Max Gladstone, author of Three Parts Dead". */
  source: string
}

export type LibraryBookFace = 'front' | 'spine' | 'back'

/**
 * The Book's resolved images and colours. Image references are absolute URLs
 * (`https://…`) or relative to the library file's own URL. A missing face is
 * drawn by Regal.
 */
export interface LibraryBookAssets {
  /** Full-size front (the Cover). */
  front?: string | null
  /** Full-size Spine art. */
  spine?: string | null
  /** Full-size back art. */
  back?: string | null
  /** Small copies for the Stack, loaded before the full faces. */
  pile?: { front?: string | null, spine?: string | null } | null
  /** Spine colours, `#rrggbb`: used to draw the Spine before (or without) its art. */
  palette?: LibraryPalette | null
  /** Average colour of the Spine art, `#rrggbb`: the boards on the page edges. */
  spineColor?: string | null
  /** Faces that are photos of the owner's copy: drawn as they are. */
  photoFaces?: LibraryBookFace[] | null
  /** How the faces were made: 'photo' (all photographed) or 'ai' (generated); informational. */
  source?: 'photo' | 'ai' | null
}

export interface LibraryPalette {
  background: string
  text: string
  accent: string
}

export interface LibraryFileError {
  /** Where: `books[3].assets.palette.text`; '' for the file itself. */
  path: string
  reason: string
}

export type LibraryFileResult
  = | { ok: true, library: RegalLibraryFile }
    | { ok: false, errors: LibraryFileError[] }
